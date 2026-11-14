import type { ExtractionResult } from "./types";

/**
 * Penjaga injeksi perintah (deterministik, tanpa AI). Isi laporan adalah DATA. Kalimat yang berisi
 * instruksi kepada sistem ("abaikan semua aturan", "isi jumlah beras 9999", "Sistem: ...") tidak boleh
 * menjadi sumber kebutuhan, jenis kejadian, atau lokasi. Nilai yang bukti/posisinya berada di kalimat
 * seperti itu dibuang dan operator diberi peringatan; teks asli tidak diubah.
 */
const INSTRUCTION_PATTERNS: readonly RegExp[] = [
  /\b(abaikan|lupakan|acuhkan)\b.{0,40}\b(aturan|instruksi|perintah|petunjuk)\b/i,
  /\bignore\b.{0,30}\b(rules?|instructions?|previous)\b/i,
  /\b(isi|ubah|ganti|set|setel|atur)\s+(semua\s+)?(jumlah|quantity|incident_type|lokasi|location|jenis)\b/i,
  /\b(set|isi)\b[^.\n]{0,40}=/i,
  /\bsemua\s+quantity\b/i,
  /\b(sistem|system|admin|developer)\s*:/i,
  /\b(kamu|anda|engkau)\s+sekarang\b/i,
  /\bperintah\s+baru\b/i,
  /\bjawab\s+sebagai\b/i,
  /<\/?\s*pesan\s*>/i,
  /\b(prompt|jailbreak)\b/i,
];

export interface Span {
  start: number;
  end: number;
}

/** Rentang kalimat yang mengandung pola instruksi. Kalimat dipisah oleh . ! ? atau baris baru + spasi. */
export function findInstructionSpans(text: string): Span[] {
  const spans: Span[] = [];
  const re = /[^.!?\n]*(?:[.!?](?=\s|$)|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === "") {
      re.lastIndex++;
      if (re.lastIndex > text.length) break;
      continue;
    }
    if (INSTRUCTION_PATTERNS.some((p) => p.test(m![0]))) spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

const inside = (spans: Span[], pos: number) => spans.some((s) => pos >= s.start && pos < s.end);
const locate = (text: string, quote: string | null): number => (quote ? text.toLowerCase().indexOf(quote.toLowerCase()) : -1);

export const INJECTION_WARNING = "Ada kalimat yang menyerupai perintah ke sistem; isinya diabaikan dan tidak dipakai sebagai data. Periksa teks asli.";

/** Buang nilai yang bersumber dari kalimat instruksi. Tanpa instruksi, hasil dikembalikan apa adanya. */
export function guardInjection(result: ExtractionResult, rawText: string): ExtractionResult {
  const spans = findInstructionSpans(rawText);
  if (spans.length === 0) return result;
  const lower = rawText.toLowerCase();
  const needs = result.needs.filter((n) => {
    // Posisi kutipan bukti; bila tidak ada kutipan, cari nama barang yang SEMUA kemunculannya ada di kalimat instruksi.
    const at = locate(rawText, n.evidenceQuote);
    let bad = at >= 0 && inside(spans, at);
    if (at < 0) {
      const item = n.item.toLowerCase();
      const hits: number[] = [];
      for (let i = lower.indexOf(item); i >= 0 && item; i = lower.indexOf(item, i + 1)) hits.push(i);
      bad = hits.length > 0 && hits.every((p) => inside(spans, p));
    }
    return !bad;
  });
  const badInc = result.incidentType !== null && (() => { const p = locate(rawText, result.incidentEvidence); return p >= 0 && inside(spans, p); })();
  const badLoc = result.locationText !== null && (() => { const p = locate(rawText, result.locationEvidence ?? result.locationText); return p >= 0 && inside(spans, p); })();
  const warnings = [...result.warnings];
  // Peringatan tetap diberikan walau tidak ada nilai yang dibuang: operator perlu tahu ada kalimat mencurigakan.
  if (!warnings.includes(INJECTION_WARNING)) warnings.push(INJECTION_WARNING);
  return {
    ...result,
    incidentType: badInc ? null : result.incidentType,
    incidentEvidence: badInc ? null : result.incidentEvidence,
    locationText: badLoc ? null : result.locationText,
    locationEvidence: badLoc ? null : result.locationEvidence,
    needs,
    warnings,
  };
}
