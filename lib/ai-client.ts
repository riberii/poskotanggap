import { aiInsightSchema } from "@/lib/domain/insight";
import type { AiInsight } from "@/lib/domain/types";
import type { AiMedia } from "@/lib/media";

export type AnalyzeResult = { ok: true; insight: AiInsight } | { ok: false; message: string };

const TIMEOUT_MS = 40_000;

/**
 * Meminta saran AI dari fungsi server. Kegagalan TIDAK pernah menghalangi laporan:
 * pemanggil tetap menyimpan laporan tanpa saran AI dan memberi tahu pengguna.
 */
export async function analyzeReport(text: string, media: AiMedia[]): Promise<AnalyzeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/.netlify/functions/analyze-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, media }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: json?.error?.message ?? "Analisis AI sedang tidak tersedia." };
    const parsed = aiInsightSchema.safeParse(json?.insight);
    if (!parsed.success) return { ok: false, message: "Hasil analisis AI tidak dapat dibaca." };
    return { ok: true, insight: parsed.data };
  } catch {
    return { ok: false, message: "Analisis AI tidak terjangkau (jaringan lambat atau terputus)." };
  } finally {
    clearTimeout(timer);
  }
}
