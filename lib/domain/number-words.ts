/**
 * Angka berupa kata Bahasa Indonesia ("dua puluh lima" = 25). Murni & deterministik.
 * Hanya bentuk yang tegas; "beberapa", "banyak", "setengah" TIDAK dikonversi (hasilnya null).
 */
const UNITS_: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
};
const WORD = "(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|seribu|puluh|belas|ratus|ribu)";
/** Deretan kata bilangan berurutan. */
export const NUMBER_WORDS_RE = new RegExp(`\\b${WORD}(?:\\s+${WORD})*\\b`, "giu");

/** Mengonversi deretan kata bilangan; null bila tidak tersusun sah (mis. "lima lima"). */
export function parseIdNumber(phrase: string): number | null {
  let total = 0; // bagian ribuan ke atas
  let current = 0; // < 1000 yang sudah pasti
  let pending = 0; // satuan yang menunggu "puluh/ratus/belas/ribu"
  for (const t of phrase.toLowerCase().trim().split(/\s+/)) {
    if (t in UNITS_) {
      if (pending) return null;
      pending = UNITS_[t];
      continue;
    }
    switch (t) {
      case "sepuluh": if (pending) return null; current += 10; break;
      case "sebelas": if (pending) return null; current += 11; break;
      case "seratus": if (pending) return null; current += 100; break;
      case "seribu": if (pending) return null; total += (current || 0) * 1000 + 1000; current = 0; break;
      case "belas": if (!pending) return null; current += 10 + pending; pending = 0; break;
      case "puluh": if (!pending) return null; current += pending * 10; pending = 0; break;
      case "ratus": current += (pending || 1) * 100; pending = 0; break;
      case "ribu": total += (current + pending || 1) * 1000; current = 0; pending = 0; break;
      default: return null;
    }
  }
  const v = total + current + pending;
  return v > 0 ? v : null;
}

/** Semua nilai angka-kata yang tertulis di teks. */
export function numbersFromWords(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUMBER_WORDS_RE)) {
    const v = parseIdNumber(m[0]);
    if (v !== null) out.push(v);
  }
  return out;
}
