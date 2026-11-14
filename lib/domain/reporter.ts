import { z } from "zod";

/**
 * Kontak pelapor (opsional, diisi sukarela). Hanya untuk tim posko menghubungi pelapor;
 * tidak pernah dibaca oleh agregasi, deteksi duplikat, ataupun AI, dan tidak dikembalikan
 * oleh endpoint publik (status/pesan).
 */
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const reporterContactSchema = z
  .object({
    name: z.preprocess(blank, z.string().trim().min(2, "Nama minimal 2 karakter").max(100).nullable()),
    email: z.preprocess(blank, z.string().trim().max(120).email("Format email tidak valid").nullable()),
    phone: z.preprocess(
      blank,
      z
        .string()
        .trim()
        .regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Nomor telepon tidak valid (7–20 angka)")
        .nullable(),
    ),
  })
  .strict();

export type ReporterContact = z.infer<typeof reporterContactSchema>;

/** Null bila ketiganya kosong, sehingga laporan tanpa kontak tidak menyimpan objek kosong. */
export function compactContact(c: ReporterContact | null | undefined): ReporterContact | null {
  if (!c) return null;
  return c.name || c.email || c.phone ? c : null;
}
