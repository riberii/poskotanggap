// Tipe domain POSKOTANGGAP. Tidak bergantung pada UI maupun database.

export const INCIDENT_TYPES = [
  "banjir",
  "tanah_longsor",
  "gempa_bumi",
  "kebakaran",
  "angin_kencang",
  "lainnya",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  banjir: "Banjir",
  tanah_longsor: "Tanah longsor",
  gempa_bumi: "Gempa bumi",
  kebakaran: "Kebakaran",
  angin_kencang: "Angin kencang",
  lainnya: "Lainnya",
};

export const REPORT_STATUSES = ["pending_review", "verified", "rejected"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const STATUS_LABELS: Record<ReportStatus, string> = {
  pending_review: "Menunggu review",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

/**
 * additional = kebutuhan tambahan yang belum terpenuhi (boleh dijumlahkan).
 * total      = total kebutuhan keseluruhan (TIDAK dijumlahkan sebagai tambahan).
 * unknown    = tidak jelas dari teks (TIDAK dijumlahkan).
 */
export const QUANTITY_BASES = ["additional", "total", "unknown"] as const;
export type QuantityBasis = (typeof QUANTITY_BASES)[number];

export const BASIS_LABELS: Record<QuantityBasis, string> = {
  additional: "Tambahan",
  total: "Total",
  unknown: "Tidak jelas",
};

/** Satuan baku. Tidak ada konversi otomatis antarsatuan di MVP. */
export const UNITS = [
  "dus",
  "botol",
  "liter",
  "kg",
  "karung",
  "paket",
  "lembar",
  "unit",
  "buah",
] as const;
export type Unit = (typeof UNITS)[number];

export interface ReportNeed {
  id: string;
  reportId: string;
  item: string;
  quantity: number | null;
  unit: Unit | null;
  quantityBasis: QuantityBasis;
  evidenceQuote: string | null;
  verified: boolean;
}

/**
 * Usulan hasil ekstraksi (DRAF). Field yang tidak ditemukan WAJIB null.
 * - uncertainties: hal ambigu yang dilaporkan model.
 * - warnings: temuan validasi deterministik server (mis. kutipan tidak cocok).
 */
export interface ExtractionResult {
  source: "simulated_rules" | "gemini";
  model: string | null;
  incidentType: IncidentType | null;
  incidentEvidence: string | null;
  locationText: string | null;
  locationEvidence: string | null;
  occurredAtText: string | null;
  needs: Array<{
    item: string;
    quantity: number | null;
    unit: Unit | null;
    quantityBasis: QuantityBasis;
    evidenceQuote: string | null;
  }>;
  uncertainties: string[];
  warnings: string[];
}

/** Keputusan operator atas potensi duplikat. null = belum diputuskan. */
export type DuplicateResolution = "confirmed_duplicate" | "keep_both";
export const DUPLICATE_RESOLUTIONS = ["confirmed_duplicate", "keep_both"] as const;

export interface Report {
  id: string;
  rawText: string;
  submittedAt: string;
  incidentType: IncidentType | null;
  locationText: string | null;
  normalizedArea: string | null;
  status: ReportStatus;
  fingerprint: string;
  duplicateOf: string | null;
  /** Opsional agar data lama tetap valid. */
  duplicateResolution?: DuplicateResolution | null;
  extraction: ExtractionResult | null;
  createdAt: string;
  verifiedAt: string | null;
  needs: ReportNeed[];
}

export interface InventoryItem {
  id: string;
  item: string;
  area: string;
  unit: Unit;
  availableQuantity: number;
  updatedAt: string;
}
