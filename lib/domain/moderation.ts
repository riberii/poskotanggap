// Moderasi pelapor & deteksi spam. Murni. Tidak ada blokir otomatis karena laporan keliru.
import { z } from "zod";

export const BLOCK_KINDS = ["temporary", "permanent"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const BLOCK_KIND_LABELS: Record<BlockKind, string> = { temporary: "Sementara", permanent: "Permanen" };
export const BLOCK_MAX_HOURS = 24 * 30;

export const blockInputSchema = z
  .object({
    /** Kode laporan yang menjadi dasar; pelapor diidentifikasi dari laporan itu (tim tidak melihat kunci pelapor). */
    reportCode: z.string().regex(/^[0-9A-Fa-f]{8}$/),
    kind: z.enum(BLOCK_KINDS),
    hours: z.number().int().min(1).max(BLOCK_MAX_HOURS).nullish(),
    reason: z.string().trim().min(10, "Alasan minimal 10 karakter").max(500),
  })
  .strict()
  .refine((v) => v.kind === "permanent" || !!v.hours, { message: "Durasi blokir sementara wajib diisi", path: ["hours"] });
export const unblockSchema = z.object({ reason: z.string().trim().min(10, "Alasan minimal 10 karakter").max(500) }).strict();

export interface BlockRecord {
  id: number;
  kind: BlockKind;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  liftedAt: string | null;
}
export const isBlockActive = (b: Pick<BlockRecord, "kind" | "expiresAt" | "liftedAt">, now = Date.now()): boolean =>
  !b.liftedAt && (b.kind === "permanent" || (!!b.expiresAt && new Date(b.expiresAt).getTime() > now));

/** Nomor layanan darurat yang tetap ditampilkan kepada pelapor yang diblokir. */
export const EMERGENCY_CONTACTS = [
  { number: "112", label: "Darurat umum" },
  { number: "115", label: "SAR (BASARNAS)" },
  { number: "119", label: "Ambulans / medis" },
  { number: "110", label: "Polisi" },
  { number: "113", label: "Pemadam kebakaran" },
] as const;

// --- Spam & duplikat (heuristik; hanya MENANDAI, tidak pernah menolak/memblokir otomatis) ---
export const SPAM_FLAGS = ["repeated_chars", "many_links", "all_caps", "too_short", "burst", "same_text_again"] as const;
export type SpamFlag = (typeof SPAM_FLAGS)[number];
export const SPAM_FLAG_LABELS: Record<SpamFlag, string> = {
  repeated_chars: "Karakter berulang",
  many_links: "Banyak tautan",
  all_caps: "Huruf kapital semua",
  too_short: "Teks sangat pendek",
  burst: "Banyak laporan dalam waktu singkat",
  same_text_again: "Teks sama dikirim ulang",
};

export interface SpamInput {
  text: string;
  /** Jumlah laporan dari pelapor yang sama dalam 10 menit terakhir. */
  recentFromReporter: number;
  /** Apakah teks yang sama persis (setelah dinormalkan) sudah pernah dikirim pelapor ini. */
  sameTextFromReporter: boolean;
}
export function detectSpam(i: SpamInput): { flags: SpamFlag[]; suspicious: boolean } {
  const flags: SpamFlag[] = [];
  const t = i.text.trim();
  if (/(.)\1{9,}/.test(t)) flags.push("repeated_chars");
  if ((t.match(/https?:\/\//gi) ?? []).length >= 3) flags.push("many_links");
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 30 && letters === letters.toUpperCase()) flags.push("all_caps");
  if (t.length < 12) flags.push("too_short");
  if (i.recentFromReporter >= 3) flags.push("burst");
  if (i.sameTextFromReporter) flags.push("same_text_again");
  // Satu penanda ringan tidak cukup; "mencurigakan" butuh dua penanda atau penanda kuat.
  const strong = flags.includes("burst") || flags.includes("same_text_again") || flags.includes("many_links");
  return { flags, suspicious: strong || flags.length >= 2 };
}

export const normalizeForCompare = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
