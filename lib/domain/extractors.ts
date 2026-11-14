import { isExactExcerpt } from "./ai-extraction";
import { guardInjection } from "./injection";
import { simulateExtraction } from "./simulated-extractor";
import type { ExtractionResult } from "./types";

/**
 * Lapisan ekstraksi modular. Setiap extractor hanya menghasilkan DRAF;
 * verifikasi selalu dilakukan manusia dan nilai turunan dihitung ulang di service.
 *
 * - RuleBasedExtractor  : default, deterministik, berjalan di browser maupun server, tanpa layanan eksternal.
 * - AI (Gemini): lib/ai/extract-handler.ts (server), digabung dengan aturan lewat lib/domain/hybrid.ts.
 */
export interface ReportExtractor {
  readonly id: "rule_based";
  /** Label jujur yang ditampilkan ke operator. */
  readonly label: string;
  extract(rawText: string): Promise<ExtractionResult>;
}

/**
 * Pemeriksaan bukti: setiap kutipan harus potongan persis teks asli.
 * Kutipan yang tidak cocok dikosongkan (null) dan dicatat sebagai peringatan,
 * tidak pernah "diperbaiki" diam-diam.
 */
export function enforceEvidence(result: ExtractionResult, rawText: string): ExtractionResult {
  const warnings = [...result.warnings];
  const check = (quote: string | null, label: string) => {
    if (quote === null || isExactExcerpt(quote, rawText)) return quote;
    warnings.push(`Kutipan bukti untuk ${label} tidak cocok dengan teks asli dan dikosongkan.`);
    return null;
  };
  return guardInjection({
    ...result,
    incidentEvidence: check(result.incidentEvidence, "jenis kejadian"),
    locationEvidence: check(result.locationEvidence, "lokasi"),
    needs: result.needs.map((n) => ({ ...n, evidenceQuote: check(n.evidenceQuote, n.item) })),
    warnings: [...new Set(warnings)],
  }, rawText);
}

export const RuleBasedExtractor: ReportExtractor = {
  id: "rule_based",
  label: "Berbasis aturan (bukan AI)",
  async extract(rawText) {
    return enforceEvidence(simulateExtraction(rawText), rawText);
  },
};
