import { ITEM_UNIT_CATALOG } from "./catalog";
import { parseIdNumber } from "./number-words";
import type { ExtractionResult, IncidentType, QuantityBasis, Unit } from "./types";
import { UNITS } from "./types";

/**
 * EKSTRAKSI BERBASIS ATURAN (regex + kata kunci) — BUKAN AI.
 * Ini metode ekstraksi default di aplikasi (lihat lib/domain/extractors.ts).
 * Hasilnya hanya usulan dan selalu harus direview manusia.
 * Informasi yang tidak ditemukan = null.
 */

const INCIDENT_KEYWORDS: Array<[IncidentType, RegExp]> = [
  ["banjir", /\b(banjir|air naik|terendam|genangan)\b/i],
  ["tanah_longsor", /\b(longsor|tanah longsor)\b/i],
  ["gempa_bumi", /\b(gempa)\b/i],
  ["kebakaran", /\b(kebakaran|terbakar)\b/i],
  ["angin_kencang", /\b(angin kencang|puting beliung|angin puting)\b/i],
];

// Awalan boleh huruf besar/kecil, tetapi nama tempat WAJIB diawali huruf kapital
// (agar "desa kami sedang banjir" tidak dianggap lokasi). Flag /i sengaja tidak dipakai.
const LOCATION_RE =
  /\b((?:[Kk]el(?:urahan)?\.?|[Dd]esa|[Dd]s\.?|[Kk]ampung|[Kk]p\.?|[Dd]usun|[Dd]sn\.?)\s+\p{Lu}[\p{L}]+(?:\s+(?![Rr][WwTt]\b)\p{Lu}[\p{L}]+)?(?:\s*,?\s*[Rr][Ww]\s*\d+)?(?:\s*,?\s*[Rr][Tt]\s*\d+)?)/u;

const UNIT_ALIASES: Record<string, Unit> = Object.fromEntries([
  ...UNITS.map((u) => [u, u] as const),
  ["dos", "dus"],
  ["kardus", "dus"],
  ["liter", "liter"],
  ["ltr", "liter"],
  ["kilo", "kg"],
  ["kilogram", "kg"],
  ["pcs", "buah"],
  ["pack", "paket"],
  ["pak", "paket"],
]);

const ITEMS = Object.keys(ITEM_UNIT_CATALOG);

// Batas kalimat = titik yang BUKAN pemisah ribuan/desimal ("2.500", "1.5").
const SENTENCE_END = /(?<!\d)\.|\.(?!\d)/g;

function sentenceAround(text: string, index: number, length: number): string {
  let start = 0;
  let end = text.length;
  for (const m of text.matchAll(SENTENCE_END)) {
    const at = m.index!;
    if (at < index) start = at + 1;
    else if (at >= index + length) {
      end = at + 1;
      break;
    }
  }
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 300);
}

function detectBasis(context: string): QuantityBasis {
  if (/\b(total|seluruh|keseluruhan|semuanya)\b/i.test(context)) return "total";
  if (/\b(tambahan|kurang|masih butuh|butuh lagi|perlu tambah)\b/i.test(context))
    return "additional";
  return "unknown";
}


// ---------------------------------------------------------------------------
// Angka milik barang: sebelum nama ("50 dus air mineral", "lima puluh dus ...")
// atau sesudahnya ("air mineral 40 botol", "beras: 50 kg", "beras dua puluh kg").
// - Titik pemisah ribuan gaya Indonesia ("2.500") dibaca 2500.
// - Angka yang diikuti kata bukan satuan ("40 pengungsi") bukan kuantitas barang → null (tetapi angkanya "terpakai").
// ---------------------------------------------------------------------------
const NUM = String.raw`\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d{1,2})?`;
const WORD = "(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|seribu|puluh|belas|ratus|ribu)";
const WORDS = `${WORD}(?:\\s+${WORD})*`;
const BEFORE_DIGITS = new RegExp(String.raw`(?<![\d.,])(${NUM})\s*([\p{L}]+)?\s*$`, "u");
const BEFORE_WORDS = new RegExp(String.raw`\b(${WORDS})\s+([\p{L}]+)?\s*$|\b(${WORDS})\s*$`, "iu");
const AFTER_DIGITS = new RegExp(String.raw`^\s*(?:[:=\-\u2013]|sebanyak)?\s*(${NUM})(?![\d])(?:\s*([\p{L}]+))?`, "iu");
const AFTER_WORDS = new RegExp(String.raw`^\s*(?:[:=\-\u2013]|sebanyak)?\s*(${WORDS})\b(?:\s*([\p{L}]+))?`, "iu");

interface Qty { value: number | null; unit: Unit | null }

function digitsToNumber(token: string): number {
  return /^\d{1,3}(\.\d{3})+$/.test(token) ? Number(token.replace(/\./g, "")) : Number(token.replace(",", "."));
}

function toQty(value: number | null, word: string | undefined): Qty {
  const unit = word ? (UNIT_ALIASES[word.toLowerCase()] ?? null) : null;
  // Kata setelah angka yang bukan satuan → angka itu bukan kuantitas barang.
  if (word && !unit) return { value: null, unit: null };
  return { value: value !== null && Number.isFinite(value) && value > 0 ? value : null, unit };
}

function quantityBefore(before: string, claimed: Set<number>): Qty | null {
  const d = BEFORE_DIGITS.exec(before);
  if (d && !claimed.has(d.index)) {
    claimed.add(d.index);
    return toQty(digitsToNumber(d[1]), d[2]);
  }
  const w = BEFORE_WORDS.exec(before);
  if (w && !d) {
    const phrase = w[1] ?? w[3];
    const word = w[1] ? w[2] : undefined;
    const at = w.index;
    // Kata terakhir bisa saja satuan yang kebetulan mirip bilangan; satuan tidak ada yang berupa kata bilangan.
    if (!claimed.has(at)) {
      claimed.add(at);
      return toQty(parseIdNumber(phrase), word);
    }
  }
  return null;
}

function quantityAfter(after: string, offset: number, claimed: Set<number>): Qty | null {
  const d = AFTER_DIGITS.exec(after);
  if (d) {
    const at = offset + d.index + d[0].indexOf(d[1]);
    if (claimed.has(at)) return null;
    claimed.add(at);
    return toQty(digitsToNumber(d[1]), d[2]);
  }
  const w = AFTER_WORDS.exec(after);
  if (w) {
    const at = offset + w.index + w[0].indexOf(w[1]);
    if (claimed.has(at)) return null;
    claimed.add(at);
    return toQty(parseIdNumber(w[1]), w[2]);
  }
  return null;
}

export function simulateExtraction(rawText: string): ExtractionResult {
  const warnings: string[] = [
    "Ekstraksi berbasis aturan (regex & kata kunci), bukan AI. Periksa semua field terhadap teks asli.",
  ];

  let incidentType: IncidentType | null = null;
  let incidentEvidence: string | null = null;
  for (const [type, re] of INCIDENT_KEYWORDS) {
    const m = re.exec(rawText);
    if (m) {
      incidentType = type;
      incidentEvidence = sentenceAround(rawText, m.index, m[0].length);
      break;
    }
  }
  if (!incidentType) warnings.push("Jenis kejadian tidak ditemukan.");

  const loc = LOCATION_RE.exec(rawText);
  const locationText = loc ? loc[1].replace(/\s+/g, " ").trim() : null;
  const locationEvidence = loc ? sentenceAround(rawText, loc.index, loc[0].length) : null;
  if (!locationText) warnings.push("Lokasi tidak ditemukan.");

  const needs: ExtractionResult["needs"] = [];
  // Proses barang menurut urutan di teks; setiap angka hanya boleh dipakai SATU barang (tidak dihitung dua kali).
  const found: Array<{ item: string; index: number; length: number }> = [];
  for (const item of ITEMS) {
    const im = new RegExp(`\\b${item.replace(/[-]/g, "[- ]?")}\\b`, "i").exec(rawText);
    if (im) found.push({ item, index: im.index, length: im[0].length });
  }
  found.sort((x, y) => x.index - y.index);
  const claimed = new Set<number>();
  for (const f of found) {
    const q =
      quantityBefore(rawText.slice(0, f.index), claimed) ??
      quantityAfter(rawText.slice(f.index + f.length), f.index + f.length, claimed);
    const evidenceQuote = sentenceAround(rawText, f.index, f.length);
    needs.push({
      item: f.item,
      quantity: q?.value ?? null,
      unit: q?.unit ?? null,
      quantityBasis: detectBasis(evidenceQuote),
      evidenceQuote,
    });
  }
  if (needs.length === 0) warnings.push("Tidak ada kebutuhan barang yang dikenali.");
  if (needs.some((n) => n.quantity === null)) warnings.push("Ada kebutuhan tanpa kuantitas.");

  return {
    source: "simulated_rules",
    model: null,
    incidentType,
    incidentEvidence,
    locationText,
    locationEvidence,
    occurredAtText: null,
    needs,
    uncertainties: [],
    warnings,
  };
}
