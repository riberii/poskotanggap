import { z } from "zod";

export const CHAT_SENDERS = ["reporter", "team"] as const;
export type ChatSender = (typeof CHAT_SENDERS)[number];
export const CHAT_SENDER_LABELS: Record<ChatSender, string> = { reporter: "Pelapor", team: "Tim posko" };

export const CHAT_BODY_MAX = 1000;
/** Batas pesan per laporan agar satu kode tidak bisa memenuhi database. */
export const CHAT_MAX_PER_REPORT = 200;

/** Lampiran pesan. Foto di-encode ulang di browser (EXIF hilang); berkas lain dikirim apa adanya. */
export const CHAT_ATTACH_MIMES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime", "application/pdf", "text/plain"] as const;
/** Batas ukuran asli; base64 menambah ±33% dan permintaan Netlify Functions maksimal 6 MB. */
export const CHAT_ATTACH_MAX_BYTES = 3_500_000;
export const CHAT_ATTACH_MAX_B64 = Math.ceil((CHAT_ATTACH_MAX_BYTES * 4) / 3) + 8;

export type ChatAttachmentKind = "image" | "video" | "file";
export const chatAttachmentKind = (mime: string): ChatAttachmentKind => (mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "file");

export interface ChatAttachment {
  name: string;
  mime: string;
  size: number;
}

export interface ChatMessage {
  id: number;
  sender: ChatSender;
  body: string;
  attachment?: ChatAttachment | null;
  createdAt: string;
}

export const chatAttachmentSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    mime: z.enum(CHAT_ATTACH_MIMES),
    size: z.number().int().positive().max(CHAT_ATTACH_MAX_BYTES),
    data: z.string().min(4).max(CHAT_ATTACH_MAX_B64).regex(/^[A-Za-z0-9+/]+={0,2}$/, "Lampiran tidak valid"),
  })
  .strict();

export const chatPostSchema = z
  .object({
    sender: z.enum(CHAT_SENDERS),
    body: z.string().trim().max(CHAT_BODY_MAX, `Maksimal ${CHAT_BODY_MAX} karakter`).default(""),
    attachment: chatAttachmentSchema.nullish(),
  })
  .strict()
  .refine((v) => v.body.length > 0 || !!v.attachment, { message: "Pesan kosong", path: ["body"] });

/** Ringkasan satu utas: dipakai tim untuk melihat laporan yang menunggu balasan. */
export interface ChatThread {
  code: string;
  count: number;
  lastSender: ChatSender;
  lastAt: string;
}

/** Utas "menunggu balasan" = pesan terakhir dari pelapor. */
export const awaitingReply = (t: Pick<ChatThread, "lastSender">) => t.lastSender === "reporter";
