import { z } from "zod";
import { isUnitCompatible } from "./catalog";
import { normalizeItem } from "./normalize";
import {
  INCIDENT_TYPES,
  QUANTITY_BASES,
  UNITS,
  type ExtractionResult,
  type Unit,
} from "./types";

/**
 * Validasi hasil ekstraksi AI — logika murni & deterministik (tanpa panggilan jaringan).
 *
 * Dua lapis:
 * 1. STRUKTUR (Zod, strict). Respons yang tidak sesuai skema DITOLAK seluruhnya
 *    dan masuk ke penanganan error/retry. Tidak pernah "diperbaiki" diam-diam.
 * 2. SEMANTIK. Setiap nilai harus didukung teks asli. Nilai yang tidak terbukti
 *    dikosongkan (null) dan dicatat sebagai peringatan yang ditampilkan ke operator.
 *    Hasil akhirnya tetap DRAF yang wajib diverifikasi manusia.
 */

export const MAX_REPORT_CHARS = 5000;
export const MIN_REPORT_CHARS = 5;
export const MAX_NEEDS = 30;

// ---------------------------------------------------------------------------
// JSON Schema yang dikirim ke Gemini (structured output).
// ---------------------------------------------------------------------------
const nullableString = (description: string, maxLength = 300) => ({
  type: ["string", "null"],
  maxLength,
  description,
});

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    incident_type: {
      type: ["string", "null"],
      enum: [...INCIDENT_TYPES, null],
      description: "Jenis kejadian yang DISEBUT di pesan. null bila tidak disebut.",
    },
    incident_evidence: nullableString("Kutipan PERSIS dari pesan yang menyebut jenis kejadian, atau null."),
    location_text: nullableString("Lokasi persis seperti tertulis di pesan, atau null. Jangan menebak.", 200),
    location_evidence: nullableString("Kutipan PERSIS dari pesan yang memuat lokasi, atau null."),
    occurred_at_text: nullableString("Waktu kejadian persis seperti tertulis (mis. 'tadi pagi'), atau null.", 120),
    needs: {
      type: "array",
      maxItems: MAX_NEEDS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string", maxLength: 80, description: "Nama barang yang dibutuhkan, huruf kecil." },
          quantity: {
            type: ["number", "null"],
            description: "Angka yang tertulis eksplisit di pesan. null bila tidak jelas/tidak ada.",
          },
          unit: {
            type: ["string", "null"],
            enum: [...UNITS, null],
            description: "Satuan yang tertulis eksplisit. null bila tidak tertulis. Jangan menebak.",
          },
          quantity_basis: {
            type: "string",
            enum: [...QUANTITY_BASES],
            description:
              "additional = kebutuhan tambahan yang belum terpenuhi; total = total kebutuhan keseluruhan; unknown = tidak jelas.",
          },
          evidence_quote: nullableString("Kutipan PERSIS dari pesan yang mendukung kebutuhan ini, atau null."),
        },
        required: ["item", "quantity", "unit", "quantity_basis", "evidence_quote"],
      },
    },
    uncertainties: {
      type: "array",
      maxItems: 20,
      items: { type: "string", maxLength: 300 },
      description: "Daftar hal yang ambigu, tidak lengkap, atau tidak dapat dipastikan dari pesan.",
    },
  },
  required: [
    "incident_type",
    "incident_evidence",
    "location_text",
    "location_evidence",
    "occurred_at_text",
    "needs",
    "uncertainties",
  ],
} as const;

// ---------------------------------------------------------------------------
// Zod: validasi struktur respons model (strict — field asing ditolak).
// ---------------------------------------------------------------------------
const str = (max: number) => z.string().max(max).nullable();

export const aiExtractionSchema = z
  .object({
    incident_type: z.enum(INCIDENT_TYPES).nullable(),
    incident_evidence: str(500),
    location_text: str(200),
    location_evidence: str(500),
    occurred_at_text: str(120),
    needs: z
      .array(
        z
          .object({
            item: z.string().trim().min(1).max(80),
            quantity: z.number().finite().positive().max(1_000_000).nullable(),
            unit: z.enum(UNITS).nullable(),
            quantity_basis: z.enum(QUANTITY_BASES),
            evidence_quote: str(500),
          })
          .strict(),
      )
      .max(MAX_NEEDS),
    uncertainties: z.array(z.string().max(300)).max(20),
  })
  .strict();
export type AiExtraction = z.infer<typeof aiExtractionSchema>;

export class MalformedModelResponseError extends Error {
  constructor(public readonly reason: string) {
    super(`Respons model tidak valid: ${reason}`);
  }
}

/** Parse teks respons model. Melempar MalformedModelResponseError bila bukan JSON valid sesuai skema. */
export function parseModelResponse(text: string | undefined | null): AiExtraction {
  if (!text || !text.trim()) throw new MalformedModelResponseError("respons kosong");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new MalformedModelResponseError("bukan JSON");
  }
  const parsed = aiExtractionSchema.safeParse(json);
  if (!parsed.success) {
    const where = parsed.error.issues
      .slice(0, 3)
      .map((i) => i.path.join(".") || "(root)")
      .join(", ");
    throw new MalformedModelResponseError(`tidak sesuai skema (${where})`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Pemeriksaan semantik: semua nilai harus didukung teks asli.
// ---------------------------------------------------------------------------
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** Kutipan harus potongan PERSIS dari teks asli (hanya perbedaan spasi/baris baru yang ditoleransi). */
export function isExactExcerpt(quote: string | null, rawText: string): boolean {
  if (quote === null) return false;
  const q = collapse(quote);
  return q.length > 0 && collapse(rawText).includes(q);
}

function containsInsensitive(haystack: string, needle: string): boolean {
  return findExcerpt(haystack, needle) !== null;
}

/** Potongan teks asli (spasi diringkas) yang cocok tanpa memedulikan huruf besar/kecil. */
function findExcerpt(haystack: string, needle: string): string | null {
  const h = collapse(haystack);
  const n = collapse(needle);
  if (!n) return null;
  const i = h.toLowerCase().indexOf(n.toLowerCase());
  return i === -1 ? null : h.slice(i, i + n.length);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bentuk tulisan angka yang diterima: "1000", "1.000", "1,5", "1.5". */
function numberForms(n: number): string[] {
  const forms = new Set<string>([String(n)]);
  if (Number.isInteger(n)) {
    forms.add(n.toLocaleString("id-ID")); // 1.000
    forms.add(n.toLocaleString("en-US")); // 1,000
  } else {
    forms.add(String(n).replace(".", ","));
  }
  return [...forms];
}

/** Angka harus tertulis eksplisit (sebagai digit) di kutipan. Kata seperti "banyak" tidak dikonversi. */
export function quantityAppearsIn(quantity: number, quote: string): boolean {
  return numberForms(quantity).some((f) => new RegExp(`(^|[^\\d.,])${escapeRe(f)}(?![\\d]|[.,]\\d)`).test(quote));
}

/** Kata/singkatan yang dianggap menyebut satuan secara eksplisit. Tidak ada konversi. */
export const UNIT_WORDS: Record<Unit, readonly string[]> = {
  dus: ["dus", "dos", "kardus", "karton"],
  botol: ["botol"],
  liter: ["liter", "ltr", "l"],
  kg: ["kg", "kilo", "kilogram"],
  karung: ["karung"],
  paket: ["paket", "pak", "pack"],
  lembar: ["lembar", "helai"],
  unit: ["unit"],
  buah: ["buah", "pcs", "biji"],
};

export function unitAppearsIn(unit: Unit, quote: string): boolean {
  return UNIT_WORDS[unit].some((w) => new RegExp(`(^|[^\\p{L}])${escapeRe(w)}(?![\\p{L}])`, "iu").test(quote));
}

/**
 * Mengubah respons model yang LOLOS validasi struktur menjadi draf.
 * Nilai yang tidak didukung teks asli dikosongkan dan dicatat di `warnings`.
 * Fungsi ini tidak pernah menambah informasi baru — hanya mempertahankan atau menghapus.
 */
export function toDraftExtraction(ai: AiExtraction, rawText: string, model: string): ExtractionResult {
  const warnings: string[] = [];

  // Jenis kejadian
  let incidentType = ai.incident_type;
  let incidentEvidence = ai.incident_evidence;
  if (incidentEvidence !== null && !isExactExcerpt(incidentEvidence, rawText)) {
    warnings.push("Kutipan bukti jenis kejadian tidak ditemukan persis di teks asli; jenis kejadian dikosongkan.");
    incidentType = null;
    incidentEvidence = null;
  } else if (incidentType !== null && incidentEvidence === null) {
    warnings.push("Jenis kejadian tidak memiliki kutipan bukti; jenis kejadian dikosongkan.");
    incidentType = null;
  }
  if (incidentType === null) incidentEvidence = null;

  // Lokasi: teks lokasi sendiri harus muncul di pesan (tidak boleh dikarang/diparafrase).
  let locationText = ai.location_text?.trim() || null;
  let locationEvidence = ai.location_evidence;
  if (locationText !== null && !containsInsensitive(rawText, locationText)) {
    warnings.push(`Lokasi "${locationText}" tidak tertulis di teks asli; lokasi dikosongkan.`);
    locationText = null;
  }
  if (locationEvidence !== null && !isExactExcerpt(locationEvidence, rawText)) locationEvidence = null;
  if (locationText !== null && locationEvidence === null) {
    // Lokasi tertulis di teks — gunakan lokasi itu sendiri sebagai bukti minimal.
    locationEvidence = findExcerpt(rawText, locationText);
  }
  if (locationText === null) locationEvidence = null;

  // Waktu kejadian: hanya bila tertulis persis.
  let occurredAtText = ai.occurred_at_text?.trim() || null;
  if (occurredAtText !== null && !containsInsensitive(rawText, occurredAtText)) {
    warnings.push("Waktu kejadian tidak tertulis di teks asli; dikosongkan.");
    occurredAtText = null;
  }

  // Kebutuhan
  const seen = new Set<string>();
  const needs: ExtractionResult["needs"] = [];
  for (const n of ai.needs) {
    const item = normalizeItem(n.item);
    const label = `"${item}"`;
    let quantity = n.quantity;
    let unit = n.unit;
    let quantityBasis = n.quantity_basis;
    let evidenceQuote = n.evidence_quote;

    if (evidenceQuote !== null && !isExactExcerpt(evidenceQuote, rawText)) {
      warnings.push(`Kutipan bukti untuk ${label} tidak ditemukan persis di teks asli.`);
      evidenceQuote = null;
    }
    if (evidenceQuote === null) {
      if (quantity !== null || unit !== null) {
        warnings.push(`Kebutuhan ${label} tanpa bukti: kuantitas & satuan dikosongkan (unresolved).`);
      }
      quantity = null;
      unit = null;
    } else {
      if (quantity !== null && !quantityAppearsIn(quantity, evidenceQuote)) {
        warnings.push(`Angka ${quantity} untuk ${label} tidak tertulis di kutipan; kuantitas dikosongkan.`);
        quantity = null;
      }
      if (unit !== null && !unitAppearsIn(unit, evidenceQuote)) {
        warnings.push(`Satuan "${unit}" untuk ${label} tidak tertulis di kutipan; satuan dikosongkan.`);
        unit = null;
      }
    }
    if (unit !== null && !isUnitCompatible(item, unit)) {
      warnings.push(`Satuan "${unit}" tidak kompatibel dengan ${label}; satuan dikosongkan.`);
      unit = null;
    }
    if (quantity === null && quantityBasis !== "unknown") quantityBasis = "unknown";
    if (quantity !== null && unit === null) {
      warnings.push(`Kebutuhan ${label} memiliki angka tanpa satuan yang jelas — lengkapi atau kosongkan.`);
    }

    const key = `${item}|${quantity}|${unit}|${quantityBasis}`;
    if (seen.has(key)) continue;
    seen.add(key);
    needs.push({ item, quantity, unit, quantityBasis, evidenceQuote });
  }

  if (incidentType === null) warnings.push("Jenis kejadian tidak ditemukan.");
  if (locationText === null) warnings.push("Lokasi tidak ditemukan.");
  if (needs.length === 0) warnings.push("Tidak ada kebutuhan barang yang ditemukan.");
  if (needs.some((n) => n.quantity === null)) warnings.push("Ada kebutuhan tanpa kuantitas yang jelas.");

  return {
    source: "gemini",
    model,
    incidentType,
    incidentEvidence,
    locationText,
    locationEvidence,
    occurredAtText,
    needs,
    uncertainties: [...new Set(ai.uncertainties.map((u) => u.trim()).filter(Boolean))],
    warnings: [...new Set(warnings)],
  };
}

// ---------------------------------------------------------------------------
// Draf AI yang dikirim ulang browser saat menyimpan laporan (jejak audit saja).
// Divalidasi ulang di server; tidak memengaruhi status maupun total.
// ---------------------------------------------------------------------------
const storedNeedSchema = z
  .object({
    item: z.string().max(80),
    quantity: z.number().finite().positive().max(1_000_000).nullable(),
    unit: z.enum(UNITS).nullable(),
    quantityBasis: z.enum(QUANTITY_BASES),
    evidenceQuote: z.string().max(500).nullable(),
  })
  .strict();

const storedExtractionSchema = z
  .object({
    source: z.literal("gemini"),
    model: z.string().max(80).nullable(),
    incidentType: z.enum(INCIDENT_TYPES).nullable(),
    incidentEvidence: z.string().max(500).nullable(),
    locationText: z.string().max(200).nullable(),
    locationEvidence: z.string().max(500).nullable(),
    occurredAtText: z.string().max(120).nullable(),
    needs: z.array(storedNeedSchema).max(MAX_NEEDS),
    uncertainties: z.array(z.string().max(300)).max(20),
    warnings: z.array(z.string().max(500)).max(60),
  })
  .strict();

/**
 * Menerima draf AI dari browser hanya bila strukturnya valid DAN semua kutipan
 * bukti adalah potongan persis teks laporan. Selain itu dikembalikan null.
 */
export function sanitizeClientExtraction(input: unknown, rawText: string): ExtractionResult | null {
  const parsed = storedExtractionSchema.safeParse(input);
  if (!parsed.success) return null;
  const e = parsed.data;
  const quotes = [e.incidentEvidence, e.locationEvidence, ...e.needs.map((n) => n.evidenceQuote)];
  if (quotes.some((q) => q !== null && !isExactExcerpt(q, rawText))) return null;
  return e;
}
