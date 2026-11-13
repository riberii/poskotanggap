// Client HTTP untuk komponen browser. Tidak memuat secret apa pun.
import type { DashboardSummary } from "@/lib/domain/aggregation";
import type { AiInsight, Attachment, ExtractionResult, Report } from "@/lib/domain/types";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: {
          status: res.status,
          code: json?.error?.code ?? "http_error",
          message: json?.error?.message ?? `Permintaan gagal (${res.status}).`,
          details: json?.error?.details ?? null,
        },
      };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: { status: 0, code: "network_error", message: "Tidak dapat terhubung ke server.", details: null } };
  }
}

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
}

export interface Api {
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
  /** Opsional: pemeriksaan potensi duplikat untuk draf. Hanya tersedia di backend lokal. */
  findDuplicate?(draft: { locationText: string | null; incidentType: string | null }, excludeId?: string): Promise<ApiResult<{ duplicateOfReport: Report | null }>>;
}

/** Backend HTTP (mode Supabase): semua aturan dan autentikasi ditegakkan server. */
export const httpApi: Api = {
  /** Ekstraksi AI server-side. Hanya tersedia bila diaktifkan eksplisit di server. */
  extract: (rawText: string) =>
    request<{ extraction: ExtractionResult; status: "draft" }>("/api/extract-report", {
      method: "POST",
      body: JSON.stringify({ rawText }),
    }),
  /** `extraction` = draf AI asli (jejak audit); server memvalidasi ulang dan menghitung ulang semua nilai turunan. */
  submitReport: (
    rawText: string,
    payload: ReviewPayload,
    action: "save" | "verify" | "reject",
    extraction: ExtractionResult | null,
    extras?: ReportExtras,
  ) =>
    request<{ report: Report }>("/api/reports", {
      method: "POST",
      body: JSON.stringify({ rawText, ...payload, action, extraction, ...extras }),
    }),
  reviewReport: (id: string, payload: ReviewPayload, action: "save" | "verify" | "reject") =>
    request<{ report: Report }>(`/api/reports/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ ...payload, action }),
    }),
  getReport: (id: string) =>
    request<{ report: Report; duplicateOfReport: Report | null }>(`/api/reports/${encodeURIComponent(id)}`),
  reviewQueue: () => request<{ reports: Report[] }>("/api/review-queue"),
  dashboard: () => request<DashboardSummary>("/api/dashboard"),
  upsertInventory: (body: { item: string; area: string; unit: string; availableQuantity: number }) =>
    request<{ item: unknown }>("/api/inventory", { method: "PUT", body: JSON.stringify(body) }),
};
