import { z } from "zod";

export const CHAT_SENDERS = ["reporter", "team"] as const;
export type ChatSender = (typeof CHAT_SENDERS)[number];
export const CHAT_SENDER_LABELS: Record<ChatSender, string> = { reporter: "Pelapor", team: "Tim posko" };

export const CHAT_BODY_MAX = 1000;
/** Batas pesan per laporan agar satu kode tidak bisa memenuhi database. */
export const CHAT_MAX_PER_REPORT = 200;

export interface ChatMessage {
  id: number;
  sender: ChatSender;
  body: string;
  createdAt: string;
}

export const chatPostSchema = z
  .object({
    sender: z.enum(CHAT_SENDERS),
    body: z.string().trim().min(1, "Pesan kosong").max(CHAT_BODY_MAX, `Maksimal ${CHAT_BODY_MAX} karakter`),
  })
  .strict();

/** Ringkasan satu utas: dipakai tim untuk melihat laporan yang menunggu balasan. */
export interface ChatThread {
  code: string;
  count: number;
  lastSender: ChatSender;
  lastAt: string;
}

/** Utas "menunggu balasan" = pesan terakhir dari pelapor. */
export const awaitingReply = (t: Pick<ChatThread, "lastSender">) => t.lastSender === "reporter";
