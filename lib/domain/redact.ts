/**
 * Redaksi data pribadi SEBELUM teks dikirim ke layanan AI. Murni & deterministik.
 * Pola: email, NIK (16 digit), nomor telepon Indonesia. Nama dan alamat TIDAK diredaksi
 * (lokasi memang dibutuhkan untuk ekstraksi); batasan ini dijelaskan di docs/AI_USAGE.md.
 */
export type RedactionKind = "email" | "nik" | "telepon";

export interface RedactionResult {
  text: string;
  counts: Record<RedactionKind, number>;
}

const PATTERNS: Array<[RedactionKind, RegExp, string]> = [
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, "[EMAIL]"],
  // NIK: 16 digit, boleh dipisah spasi/titik/strip.
  ["nik", /(?<![\d])(?:\d[ .-]?){15}\d(?![\d])/g, "[NIK]"],
  // Telepon: +62 / 62 / 0 diikuti 8xx (seluler) atau kode area; minimal 9 digit total.
  ["telepon", /(?<![\w])(?:\+?62|0)[ -]?\(?\d{2,4}\)?(?:[ -]?\d{2,5}){2,3}(?![\d])/g, "[TELEPON]"],
];

export function redactPii(input: string): RedactionResult {
  const counts: Record<RedactionKind, number> = { email: 0, nik: 0, telepon: 0 };
  let text = input;
  for (const [kind, re, token] of PATTERNS) {
    text = text.replace(re, () => {
      counts[kind]++;
      return token;
    });
  }
  return { text, counts };
}

export const totalRedactions = (r: RedactionResult) => r.counts.email + r.counts.nik + r.counts.telepon;
