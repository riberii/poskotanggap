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

  try {
    const report = await repo.createReport({
      rawText: data.rawText,
      submittedAt: now.toISOString(),
      incidentType: data.incidentType,
      locationText: data.locationText,
      normalizedArea,
      status: verify ? "verified" : "pending_review",
      fingerprint,
      duplicateOf,
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

  const report = await repo.updateReport(current.id, {
    incidentType: data.incidentType,
    locationText: data.locationText,
    normalizedArea,
    status,
    duplicateOf,
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
