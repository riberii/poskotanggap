// Normalisasi deterministik. Sengaja sederhana agar mudah dijelaskan.

/**
 * Normalisasi pesan untuk fingerprint duplikat persis:
 * - Unicode NFKC, huruf kecil
 * - semua whitespace (termasuk baris baru) menjadi satu spasi
 * - spasi di awal/akhir dihapus
 * - tanda baca berulang di akhir kalimat dihapus
 * Isi kata dan angka tidak diubah, sehingga "50 dus" ≠ "60 dus".
 */
export function normalizeMessage(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?,;:\s]+$/u, "");
}

const AREA_PREFIXES = [
  "kelurahan",
  "kel",
  "desa",
  "ds",
  "kampung",
  "kp",
  "dusun",
  "dsn",
  "kecamatan",
  "kec",
];

/**
 * Normalisasi nama area. Contoh: "Kel. Sukamaju, RW 03" -> "sukamaju rw 03".
 * Mengembalikan null bila input kosong/null.
 */
export function normalizeArea(location: string | null | undefined): string | null {
  if (location == null) return null;
  let s = location
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const prefix of AREA_PREFIXES) {
    if (s.startsWith(prefix + " ")) {
      s = s.slice(prefix.length + 1);
      break;
    }
  }
  s = s.trim();
  return s.length > 0 ? s : null;
}

/** Normalisasi nama barang: huruf kecil, spasi tunggal. */
export function normalizeItem(item: string): string {
  return item.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}
