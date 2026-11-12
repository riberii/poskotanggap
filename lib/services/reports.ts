import { buildDashboardSummary } from "@/lib/domain/aggregation";
import { findPotentialDuplicate } from "@/lib/domain/duplicates";
import { fingerprintMessage } from "@/lib/domain/fingerprint";
import { normalizeArea, normalizeItem } from "@/lib/domain/normalize";
import {
  extractRequestSchema,
  inventoryInputSchema,
  reviewReportSchema,
  submitReportSchema,
  uuidSchema,
  type NeedInput,
} from "@/lib/domain/schemas";
import { sanitizeClientExtraction } from "@/lib/domain/ai-extraction";
import type { IncidentType, Report } from "@/lib/domain/types";
import { ExactDuplicateError, type DataRepository, type NeedRecord } from "@/lib/data/repository";
import { ServiceError, validationError } from "./errors";

/**
 * Service layer: semua aturan bisnis dijalankan di server.
 * Nilai turunan (fingerprint, normalized_area, status, duplicate_of,
 * verified_at, extraction_json) SELALU dihitung ulang di sini —
 * tidak pernah dipercaya dari browser.
 */

function toNeedRecords(needs: NeedInput[], verified: boolean): NeedRecord[] {
  return needs.map((n) => ({
    item: normalizeItem(n.item),
    quantity: n.quantity,
    unit: n.unit,
    quantityBasis: n.quantityBasis,
    evidenceQuote: n.evidenceQuote,
    verified,
  }));
}

function assertVerifiable(
  fields: { incidentType: IncidentType | null; locationText: string | null },
  duplicateOf: string | null,
  duplicateReviewed: boolean | undefined,
) {
  const missing: string[] = [];
  if (!fields.incidentType) missing.push("incidentType");
  if (!normalizeArea(fields.locationText)) missing.push("locationText");
  if (missing.length > 0) {
    throw new ServiceError(
      422,
      "verification_incomplete",
      "Jenis kejadian dan lokasi wajib diisi sebelum verifikasi.",
      missing,
    );
  }
  if (duplicateOf && !duplicateReviewed) {
    throw new ServiceError(
      409,
      "duplicate_review_required",
      "Laporan ini mirip dengan laporan lain (area dan jenis kejadian sama). Periksa dan konfirmasi sebelum verifikasi.",
      { duplicateOf },
    );
  }
}

/** Validasi body POST /api/extract-report. Ekstraksi AI-nya sendiri ada di gemini-extractor.ts. */
export function parseExtractRequest(input: unknown): string {
  const parsed = extractRequestSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data.rawText;
}

/**
 * Keputusan operator atas potensi duplikat:
 * - confirmed_duplicate: hanya sah bila memang ada acuan duplikat; laporan disimpan sebagai ditolak (tidak dihapus).
 * - keep_both: dicatat saat verifikasi laporan yang ditandai duplikat dan operator sudah membandingkan.
 */
function resolveDuplicate(
  action: "save" | "verify" | "reject",
  requested: "confirmed_duplicate" | "keep_both" | undefined,
  duplicateOf: string | null,
  duplicateReviewed: boolean | undefined,
  previous: "confirmed_duplicate" | "keep_both" | null | undefined,
): "confirmed_duplicate" | "keep_both" | null {
  if (!duplicateOf) return null;
  if (action === "reject" && requested === "confirmed_duplicate") return "confirmed_duplicate";
  if (action === "verify" && duplicateReviewed) return "keep_both";
  return action === "reject" ? (previous ?? null) : null;
}

export async function submitReport(
  repo: DataRepository,
  input: unknown,
  now: Date = new Date(),
): Promise<{ report: Report }> {
  const parsed = submitReportSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const data = parsed.data;

  // A. Duplikat persis
  const fingerprint = fingerprintMessage(data.rawText);
  const exact = await repo.findReportByFingerprint(fingerprint);
  if (exact) {
    throw new ServiceError(409, "exact_duplicate", "Laporan identik sudah tercatat dan tidak dihitung dua kali.", {
      existingId: exact.id,
    });
  }

  // B. Potensi duplikat (hanya penanda)
  const normalizedArea = normalizeArea(data.locationText);
  const duplicateOf = findPotentialDuplicate(
    { normalizedArea, incidentType: data.incidentType },
    await repo.listReports(),
  );

  const verify = data.action === "verify";
  if (verify) assertVerifiable(data, duplicateOf, data.duplicateReviewed);
  if (data.action === "reject" && (!duplicateOf || data.duplicateResolution !== "confirmed_duplicate")) {
    throw new ServiceError(422, "reject_requires_duplicate", "Laporan baru hanya dapat ditolak sebagai duplikat yang sudah dikonfirmasi.");
  }

  try {
    const report = await repo.createReport({
      rawText: data.rawText,
      submittedAt: now.toISOString(),
      incidentType: data.incidentType,
      locationText: data.locationText,
      normalizedArea,
      status: verify ? "verified" : data.action === "reject" ? "rejected" : "pending_review",
      fingerprint,
      duplicateOf,
      duplicateResolution: resolveDuplicate(data.action, data.duplicateResolution, duplicateOf, data.duplicateReviewed, null),
      // Jejak audit draf AI: hanya disimpan bila valid & kutipannya cocok dengan teks. Tidak memengaruhi total.
      extraction: sanitizeClientExtraction(data.extraction, data.rawText),
      verifiedAt: verify ? now.toISOString() : null,
      needs: toNeedRecords(data.needs, verify),
    });
    return { report };
  } catch (err) {
    if (err instanceof ExactDuplicateError) {
      throw new ServiceError(409, "exact_duplicate", "Laporan identik sudah tercatat dan tidak dihitung dua kali.", {
        existingId: err.existingId,
      });
    }
    throw err;
  }
}

export async function reviewReport(
  repo: DataRepository,
  id: unknown,
  input: unknown,
  now: Date = new Date(),
): Promise<{ report: Report }> {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) throw new ServiceError(400, "invalid_id", "ID laporan tidak valid.");
  const parsed = reviewReportSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const data = parsed.data;

  const current = await repo.getReport(idParsed.data);
  if (!current) throw new ServiceError(404, "not_found", "Laporan tidak ditemukan.");
  if (current.status === "rejected") {
    throw new ServiceError(409, "already_rejected", "Laporan yang ditolak tidak dapat diubah.");
  }

  const normalizedArea = normalizeArea(data.locationText);
  const duplicateOf = findPotentialDuplicate(
    { id: current.id, normalizedArea, incidentType: data.incidentType },
    (await repo.listReports()).filter((r) => r.submittedAt <= current.submittedAt),
  );

  const status =
    data.action === "verify" ? "verified" : data.action === "reject" ? "rejected" : "pending_review";
  if (status === "verified") assertVerifiable(data, duplicateOf, data.duplicateReviewed);
  if (data.action === "reject" && data.duplicateResolution === "confirmed_duplicate" && !duplicateOf) {
    throw new ServiceError(422, "reject_requires_duplicate", "Tidak ada laporan acuan duplikat untuk laporan ini.");
  }

  const report = await repo.updateReport(current.id, {
    incidentType: data.incidentType,
    locationText: data.locationText,
    normalizedArea,
    status,
    duplicateOf,
    duplicateResolution: resolveDuplicate(data.action, data.duplicateResolution, duplicateOf, data.duplicateReviewed, current.duplicateResolution),
    verifiedAt: status === "verified" ? now.toISOString() : null,
    needs: toNeedRecords(data.needs, status === "verified"),
  });
  return { report };
}

export async function getDashboard(repo: DataRepository) {
  const [reports, inventory] = await Promise.all([repo.listReports(), repo.listInventory()]);
  return buildDashboardSummary(reports, inventory);
}

export async function listReviewQueue(repo: DataRepository) {
  const reports = await repo.listReports();
  return reports
    .filter((r) => r.status === "pending_review")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export async function getReportDetail(repo: DataRepository, id: unknown) {
  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) throw new ServiceError(400, "invalid_id", "ID laporan tidak valid.");
  const report = await repo.getReport(idParsed.data);
  if (!report) throw new ServiceError(404, "not_found", "Laporan tidak ditemukan.");
  const duplicateOfReport = report.duplicateOf ? await repo.getReport(report.duplicateOf) : null;
  return { report, duplicateOfReport };
}

export async function upsertInventory(repo: DataRepository, input: unknown, now: Date = new Date()) {
  const parsed = inventoryInputSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const area = normalizeArea(parsed.data.area);
  if (!area) throw new ServiceError(400, "invalid_input", "Area tidak valid.");
  const item = await repo.upsertInventory({
    item: normalizeItem(parsed.data.item),
    area,
    unit: parsed.data.unit,
    availableQuantity: parsed.data.availableQuantity,
    updatedAt: now.toISOString(),
  });
  return { item };
}

/** Pemeriksaan duplikat untuk draf yang belum disimpan (area & jenis kejadian sama). Hanya membaca. */
export async function checkPotentialDuplicate(repo: DataRepository, input: unknown, excludeId?: string) {
  const { locationText, incidentType } = (input ?? {}) as { locationText?: string | null; incidentType?: IncidentType | null };
  let reports = await repo.listReports();
  // Sama seperti reviewReport: laporan yang sudah ada hanya dibandingkan dengan laporan yang masuk lebih dulu.
  const current = excludeId ? reports.find((r) => r.id === excludeId) : undefined;
  if (current) reports = reports.filter((r) => r.submittedAt <= current.submittedAt);
  const id = findPotentialDuplicate(
    { id: excludeId, normalizedArea: normalizeArea(locationText ?? null), incidentType: incidentType ?? null },
    reports,
  );
  return { duplicateOfReport: id ? (reports.find((r) => r.id === id) ?? null) : null };
}
