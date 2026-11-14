import type { ApiResult } from "@/lib/api-client";
import { revalidateDraft } from "@/lib/domain/ai-extraction";
import { mergeReaders } from "@/lib/domain/hybrid";
import { UNAUTHORIZED_EVENT } from "@/lib/remote";
import type { ExtractionResult } from "@/lib/domain/types";

export interface HybridOutcome {
  extraction: ExtractionResult;
  status: "draft";
  /** "hybrid" = dua pembaca; "rules_only" = AI tidak dipakai (alasan di aiNote). */
  reader: "hybrid" | "rules_only";
  aiNote: string | null;
  redactions: number;
}

const TIMEOUT_MS = 25_000;

/**
 * Dua pembaca independen: aturan (lokal) + AI (server). Bila AI gagal, kuota habis, atau tidak
 * dikonfigurasi, kembali ke aturan SAJA dan memberi tahu pengguna; tidak pernah memakai data tiruan.
 */
export async function extractHybrid(
  rawText: string,
  rules: (t: string) => Promise<ApiResult<{ extraction: ExtractionResult; status: "draft" }>>,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<HybridOutcome>> {
  const base = await rules(rawText);
  if (!base.ok) return base;
  const fallback = (note: string): ApiResult<HybridOutcome> => ({
    ok: true,
    data: { ...base.data, reader: "rules_only", aiNote: note, redactions: 0 },
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawText.trim() }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      const code = body?.error?.code;
      return fallback(
        code === "ai_not_configured" ? "AI belum dikonfigurasi di server."
        : code === "rate_limited" || code === "ai_rate_limited" ? "Kuota AI sedang penuh."
        : (body?.error?.message ?? "AI tidak tersedia."),
      );
    }
    const ai = body?.extraction as ExtractionResult | undefined;
    if (!ai || !Array.isArray(ai.needs)) return fallback("Respons AI tidak dapat dibaca.");
    const checked = revalidateDraft(ai, rawText);
    return {
      ok: true,
      data: {
        extraction: mergeReaders(base.data.extraction, checked),
        status: "draft",
        reader: "hybrid",
        aiNote: null,
        redactions: Number(body?.redactions) || 0,
      },
    };
  } catch {
    return fallback("AI tidak terjangkau atau terlalu lama.");
  } finally {
    clearTimeout(timer);
  }
}
