// Tipe antarmuka data untuk komponen browser (diimplementasikan backend localStorage).
import type { DashboardSummary } from "@/lib/domain/aggregation";
import type { ReportStatusView } from "@/lib/services/reports";
import type { HybridOutcome } from "@/lib/ai-extract-client";
import type { GeoPoint } from "@/lib/domain/geo";
import type { AiInsight, Attachment, ExtractionResult, Report } from "@/lib/domain/types";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ReviewPayload {
  incidentType: string | null;
  locationText: string | null;
  needs: Array<{
    item: string;
    quantity: number | null;
    unit: string | null;
    quantityBasis: string;
    evidenceQuote: string | null;
  }>;
  duplicateReviewed?: boolean;
  duplicateResolution?: "confirmed_duplicate" | "keep_both";
}

/** Tambahan dari pelapor: lampiran dan saran AI (penasihat saja). */
export interface ReportExtras {
  attachments?: Attachment[];
  aiInsight?: AiInsight | null;
  geo?: GeoPoint | null;
}

export interface Api {
  /** Dua pembaca (aturan + AI); kembali ke aturan saja bila AI gagal. Hanya dipakai di layar operator. */
  extractHybrid(rawText: string): Promise<ApiResult<HybridOutcome>>;
  extract(rawText: string): Promise<ApiResult<{ extraction: ExtractionResult; status: "draft" }>>;
  submitReport(
    rawText: string,
    payload: ReviewPayload,
    action: "save" | "verify" | "reject",
    extraction: ExtractionResult | null,
    extras?: ReportExtras,
  ): Promise<ApiResult<{ report: Report }>>;
  reviewReport(id: string, payload: ReviewPayload, action: "save" | "verify" | "reject"): Promise<ApiResult<{ report: Report }>>;
  getReport(id: string): Promise<ApiResult<{ report: Report; duplicateOfReport: Report | null }>>;
  reviewQueue(): Promise<ApiResult<{ reports: Report[] }>>;
  dashboard(): Promise<ApiResult<DashboardSummary>>;
  upsertInventory(body: { item: string; area: string; unit: string; availableQuantity: number }): Promise<ApiResult<{ item: unknown }>>;
  /** Tindak lanjut: operator menandai bantuan diatur. Tidak memengaruhi perhitungan. */
  arrangeAid(id: string, note: string | null): Promise<ApiResult<{ report: Report }>>;
  /** Status untuk pelapor lewat kode laporan. */
  getReportStatus(code: string): Promise<ApiResult<ReportStatusView>>;
  /** Pemeriksaan potensi duplikat untuk draf. */
  findDuplicate(draft: { locationText: string | null; incidentType: string | null }, excludeId?: string): Promise<ApiResult<{ duplicateOfReport: Report | null }>>;
}
