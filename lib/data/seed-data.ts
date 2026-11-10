import { fingerprintMessage } from "@/lib/domain/fingerprint";
import { normalizeArea, normalizeItem } from "@/lib/domain/normalize";
import { simulateExtraction } from "@/lib/domain/simulated-extractor";
import type { InventoryItem, Report, ReportNeed } from "@/lib/domain/types";

/**
 * DATA SIMULASI. Semua nama tempat, waktu, dan angka di bawah ini fiktif dan
 * dibuat untuk demonstrasi. Tidak mewakili kejadian atau lokasi nyata.
 */

type SeedNeed = Omit<ReportNeed, "id" | "reportId">;

interface SeedReport {
  id: string;
  rawText: string;
  submittedAt: string;
  incidentType: Report["incidentType"];
  locationText: string | null;
  status: Report["status"];
  duplicateOf?: string;
  needs: SeedNeed[];
}

export const SEED_REPORTS: SeedReport[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    rawText:
      "[SIMULASI] Banjir setinggi lutut di Kelurahan Simulasi Barat RW 03. Sekitar 40 KK mengungsi di balai warga. Masih butuh tambahan 30 dus air mineral dan 50 kg beras.",
    submittedAt: "2026-11-08T07:15:00.000Z",
    incidentType: "banjir",
    locationText: "Kelurahan Simulasi Barat RW 03",
    status: "verified",
    needs: [
      need("air mineral", 30, "dus", "additional", "Masih butuh tambahan 30 dus air mineral dan 50 kg beras."),
      need("beras", 50, "kg", "additional", "Masih butuh tambahan 30 dus air mineral dan 50 kg beras."),
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    rawText:
      "[SIMULASI] Tanah longsor menutup akses jalan di Desa Fiktif Jaya. Pengungsi perlu tambah 20 lembar selimut dan 5 unit tenda.",
    submittedAt: "2026-11-08T09:40:00.000Z",
    incidentType: "tanah_longsor",
    locationText: "Desa Fiktif Jaya",
    status: "verified",
    needs: [
      need("selimut", 20, "lembar", "additional", "Pengungsi perlu tambah 20 lembar selimut dan 5 unit tenda."),
      need("tenda", 5, "unit", "additional", "Pengungsi perlu tambah 20 lembar selimut dan 5 unit tenda."),
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    rawText:
      "[SIMULASI] Update banjir Kelurahan Simulasi Barat RW 03: total kebutuhan air mineral seluruh posko 120 dus.",
    submittedAt: "2026-11-08T11:05:00.000Z",
    incidentType: "banjir",
    locationText: "Kelurahan Simulasi Barat RW 03",
    status: "pending_review",
    duplicateOf: "00000000-0000-4000-8000-000000000001",
    needs: [
      need("air mineral", 120, "dus", "total", "total kebutuhan air mineral seluruh posko 120 dus."),
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    rawText:
      "[SIMULASI] Warga Kampung Latihan Hilir terdampak angin kencang, beberapa atap rusak. Butuh obat-obatan, jumlah belum diketahui.",
    submittedAt: "2026-11-08T12:30:00.000Z",
    incidentType: "angin_kencang",
    locationText: "Kampung Latihan Hilir",
    status: "pending_review",
    needs: [need("obat-obatan", null, "paket", "unknown", "Butuh obat-obatan, jumlah belum diketahui.")],
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    rawText:
      "[SIMULASI] Ada genangan dan warga minta popok bayi 15 paket, lokasi belum jelas.",
    submittedAt: "2026-11-08T13:10:00.000Z",
    incidentType: "banjir",
    locationText: null,
    status: "pending_review",
    needs: [need("popok", 15, "paket", "unknown", "warga minta popok bayi 15 paket")],
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    rawText:
      "[SIMULASI] Posko Desa Fiktif Jaya masih kurang air mineral 40 botol untuk anak-anak.",
    submittedAt: "2026-11-08T14:20:00.000Z",
    incidentType: "tanah_longsor",
    locationText: "Desa Fiktif Jaya",
    status: "verified",
    needs: [need("air mineral", 40, "botol", "additional", "masih kurang air mineral 40 botol untuk anak-anak.")],
  },
];

export const SEED_INVENTORY: Array<Omit<InventoryItem, "id" | "area"> & { id: string; areaText: string }> = [
  { id: "10000000-0000-4000-8000-000000000001", item: "air mineral", areaText: "Kelurahan Simulasi Barat RW 03", unit: "dus", availableQuantity: 12, updatedAt: "2026-11-08T06:00:00.000Z" },
  { id: "10000000-0000-4000-8000-000000000002", item: "beras", areaText: "Kelurahan Simulasi Barat RW 03", unit: "kg", availableQuantity: 75, updatedAt: "2026-11-08T06:00:00.000Z" },
  { id: "10000000-0000-4000-8000-000000000003", item: "selimut", areaText: "Desa Fiktif Jaya", unit: "lembar", availableQuantity: 8, updatedAt: "2026-11-08T06:30:00.000Z" },
  { id: "10000000-0000-4000-8000-000000000004", item: "air mineral", areaText: "Desa Fiktif Jaya", unit: "dus", availableQuantity: 10, updatedAt: "2026-11-08T06:30:00.000Z" },
];

function need(
  item: string,
  quantity: number | null,
  unit: SeedNeed["unit"],
  quantityBasis: SeedNeed["quantityBasis"],
  evidenceQuote: string,
): SeedNeed {
  return { item, quantity, unit, quantityBasis, evidenceQuote, verified: false };
}

export function buildSeed(): { reports: Report[]; inventory: InventoryItem[] } {
  const reports: Report[] = SEED_REPORTS.map((s) => {
    const verified = s.status === "verified";
    return {
      id: s.id,
      rawText: s.rawText,
      submittedAt: s.submittedAt,
      incidentType: s.incidentType,
      locationText: s.locationText,
      normalizedArea: normalizeArea(s.locationText),
      status: s.status,
      fingerprint: fingerprintMessage(s.rawText),
      duplicateOf: s.duplicateOf ?? null,
      extraction: simulateExtraction(s.rawText),
      createdAt: s.submittedAt,
      verifiedAt: verified ? s.submittedAt : null,
      needs: s.needs.map((n, i) => ({
        ...n,
        id: `20000000-0000-4000-8000-${s.id.slice(-6)}${String(i + 1).padStart(6, "0")}`,
        reportId: s.id,
        verified,
      })),
    };
  });
  const inventory: InventoryItem[] = SEED_INVENTORY.map(({ areaText, ...inv }) => ({
    ...inv,
    item: normalizeItem(inv.item),
    area: normalizeArea(areaText)!,
  }));
  return { reports, inventory };
}
