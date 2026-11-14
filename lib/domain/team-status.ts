import { z } from "zod";

/** Status layanan yang ditetapkan tim untuk pelapor. Hanya informasi: tidak memengaruhi agregasi kebutuhan. */
export const TEAM_STATUSES = ["approved", "rejected", "waitlist", "waiting_reply", "waiting_aid", "in_progress", "done"] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  approved: "Disetujui",
  rejected: "Ditolak",
  waitlist: "Waitlist",
  waiting_reply: "Menunggu jawaban Anda",
  waiting_aid: "Menunggu ketersediaan bantuan",
  in_progress: "Bantuan dalam proses",
  done: "Selesai",
};

export const TEAM_STATUS_TONE: Record<TeamStatus, "ok" | "warn" | "danger" | "neutral"> = {
  approved: "ok",
  rejected: "danger",
  waitlist: "warn",
  waiting_reply: "warn",
  waiting_aid: "warn",
  in_progress: "ok",
  done: "ok",
};

export const TEAM_STATUS_NOTE_MAX = 200;

export const teamStatusSchema = z
  .object({
    status: z.enum(TEAM_STATUSES),
    note: z.string().trim().max(TEAM_STATUS_NOTE_MAX).nullable(),
  })
  .strict();

export interface StatusHistoryEntry {
  label: string;
  note: string | null;
  at: string;
}

export interface TeamStatusView {
  status: TeamStatus;
  label: string;
  note: string | null;
  at: string;
}

/** Nilai di database bisa lama/rusak: kembalikan null bila bukan status yang dikenal. */
export function toTeamStatusView(status: string | null, note: string | null, at: Date | null): TeamStatusView | null {
  if (!status || !at || !(TEAM_STATUSES as readonly string[]).includes(status)) return null;
  const s = status as TeamStatus;
  return { status: s, label: TEAM_STATUS_LABELS[s], note, at: at.toISOString() };
}

/** Label riwayat untuk perubahan status inti (verifikasi/penolakan dari antrean tim). */
export const CORE_STATUS_LOG_LABEL: Record<string, string> = {
  verified: "Laporan terverifikasi",
  rejected: "Laporan ditolak / ditutup",
  pending_review: "Kembali menunggu pemeriksaan",
};
