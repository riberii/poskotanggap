import type {
  AiInsight,
  Attachment,
  DuplicateResolution,
  FollowUp,
  ExtractionResult,
  IncidentType,
  InventoryItem,
  Report,
  ReportNeed,
  ReportStatus,
  Unit,
} from "@/lib/domain/types";

/**
 * Lapisan data: satu interface (implementasi: localStorage browser dan MockRepository untuk tes).
 * Komponen UI tidak pernah mengakses lapisan ini secara langsung —
 * UI memanggil route handler (/api/*), route handler memanggil service,
 * service memanggil repository.
 */

export type NeedRecord = Omit<ReportNeed, "id" | "reportId">;

export interface NewReportRecord {
  rawText: string;
  submittedAt: string;
  incidentType: IncidentType | null;
  locationText: string | null;
  normalizedArea: string | null;
  status: ReportStatus;
  fingerprint: string;
  duplicateOf: string | null;
  duplicateResolution?: DuplicateResolution | null;
  extraction: ExtractionResult | null;
  verifiedAt: string | null;
  needs: NeedRecord[];
  attachments?: Attachment[];
  aiInsight?: AiInsight | null;
}

export interface ReportUpdateRecord {
  incidentType: IncidentType | null;
  locationText: string | null;
  normalizedArea: string | null;
  status: ReportStatus;
  duplicateOf: string | null;
  duplicateResolution?: DuplicateResolution | null;
  verifiedAt: string | null;
  needs: NeedRecord[];
  /** Diisi service: null bila laporan tidak lagi terverifikasi. */
  followUp?: FollowUp | null;
}

export interface InventoryRecord {
  item: string;
  area: string;
  unit: Unit;
  availableQuantity: number;
  updatedAt: string;
}

/** Prototipe: data hanya di localStorage browser ini. */
export type DataMode = "local";

export interface DataRepository {
  readonly mode: DataMode;
  listReports(): Promise<Report[]>;
  getReport(id: string): Promise<Report | null>;
  findReportByFingerprint(fingerprint: string): Promise<Report | null>;
  /** Harus melempar ExactDuplicateError bila fingerprint sudah ada. */
  createReport(record: NewReportRecord): Promise<Report>;
  updateReport(id: string, record: ReportUpdateRecord): Promise<Report>;
  /** Menandai/menghapus tindak lanjut tanpa menyentuh data kebutuhan. */
  setFollowUp(id: string, followUp: FollowUp | null): Promise<Report>;
  listInventory(): Promise<InventoryItem[]>;
  upsertInventory(record: InventoryRecord): Promise<InventoryItem>;
}

export class ExactDuplicateError extends Error {
  constructor(public readonly existingId: string | null) {
    super("Laporan identik sudah tercatat");
  }
}
