import { ITEM_UNIT_CATALOG } from "./catalog";
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
  /\b((?:[Kk]el(?:urahan)?\.?|[Dd]esa|[Dd]s\.?|[Kk]ampung|[Kk]p\.?|[Dd]usun|[Dd]sn\.?)\s+\p{Lu}[\p{L}]+(?:\s+\p{Lu}[\p{L}]+)?(?:\s*,?\s*[Rr][Ww]\s*\d+)?(?:\s*,?\s*[Rr][Tt]\s*\d+)?)/u;

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

function sentenceAround(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index) + 1);
  const endDot = text.indexOf(".", index + length);
  const end = endDot === -1 ? text.length : endDot + 1;
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 300);
}

function detectBasis(context: string): QuantityBasis {
  if (/\b(total|seluruh|keseluruhan|semuanya)\b/i.test(context)) return "total";
  if (/\b(tambahan|kurang|masih butuh|butuh lagi|perlu tambah)\b/i.test(context))
    return "additional";
  return "unknown";
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
  for (const item of ITEMS) {
    const itemRe = new RegExp(`\\b${item.replace(/[-]/g, "[- ]?")}\\b`, "i");
    const im = itemRe.exec(rawText);
    if (!im) continue;
    // Cari "<angka> <satuan>" tepat sebelum nama barang (mis. "50 dus air mineral").
    // - Titik pemisah ribuan gaya Indonesia ("2.500") dibaca 2500, bukan dipotong menjadi 500.
    // - Angka yang diikuti kata bukan satuan ("40 pengungsi air mineral") bukan kuantitas barang → null.
    const before = rawText.slice(0, im.index);
    const qm = /(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d{1,2})?)\s*([a-zA-Z]+)?\s*$/.exec(before);
    let quantity: number | null = null;
    let unit: Unit | null = null;
    if (qm) {
      const word = qm[2]?.toLowerCase();
      unit = word ? (UNIT_ALIASES[word] ?? null) : null;
      if (!word || unit) {
        const token = qm[1];
        quantity = /^\d{1,3}(\.\d{3})+$/.test(token) ? Number(token.replace(/\./g, "")) : Number(token.replace(",", "."));
      }
    }
    const evidenceQuote = sentenceAround(rawText, im.index, im[0].length);
    needs.push({
      item,
      quantity: quantity !== null && Number.isFinite(quantity) && quantity > 0 ? quantity : null,
      unit,
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
