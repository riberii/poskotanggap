import type { Report } from "./types";

/** received → verified → arranged. "closed" = laporan ditolak/duplikat (di luar alur). */
export const FOLLOW_UP_STAGES = ["received", "verified", "arranged"] as const;
export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number] | "closed";

export const FOLLOW_UP_NOTE_MAX = 200;

/**
 * Tahap tindak lanjut untuk pelapor. Murni; tidak memengaruhi perhitungan kebutuhan.
 * "arranged" hanya sah bila laporan masih terverifikasi dan operator menandainya.
 */
export function followUpStage(r: Pick<Report, "status" | "followUp">): FollowUpStage {
  if (r.status === "rejected") return "closed";
  if (r.status === "verified") return r.followUp ? "arranged" : "verified";
  return "received";
}

/** Kode laporan untuk pelapor: 8 karakter pertama id, huruf besar. */
export const reportCode = (id: string) => id.slice(0, 8).toUpperCase();
