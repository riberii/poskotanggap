// Aturan murni untuk sinkron lintas perangkat (dipakai Netlify Function dan tes).
import { z } from "zod";
import { followUpStage, reportCode, type FollowUpStage } from "@/lib/domain/follow-up";
import { sanitizeIncoming } from "@/lib/domain/stored-report";
import { reportCodeSchema } from "@/lib/domain/schemas";

/** Batas isi permintaan (Netlify Functions menolak > 6 MB). */
export const MAX_BODY_BYTES = 5_000_000;

export const statusUpdateSchema = z
  .object({
    status: z.enum(["pending_review", "verified", "rejected"]),
    duplicate: z.boolean(),
    followUp: z
      .object({ arrangedAt: z.string().datetime({ offset: true }), note: z.string().max(200).nullable() })
      .strict()
      .nullable(),
  })
  .strict();

export interface StoredStatus {
  id: string;
  status: "pending_review" | "verified" | "rejected";
  duplicate: boolean;
  arrangedAt: Date | null;
  arrangedNote: string | null;
  submittedAt: Date;
}

export interface RemoteStatusView {
  code: string;
  stage: FollowUpStage;
  duplicate: boolean;
  note: string | null;
  submittedAt: string;
}

export function toStatusView(row: StoredStatus): RemoteStatusView {
  const followUp = row.arrangedAt ? { arrangedAt: row.arrangedAt.toISOString(), note: row.arrangedNote } : null;
  const stage = followUpStage({ status: row.status, followUp });
  return {
    code: reportCode(row.id),
    stage,
    duplicate: row.duplicate,
    note: stage === "arranged" ? row.arrangedNote : null,
    submittedAt: row.submittedAt.toISOString(),
  };
}

export function parseCode(raw: unknown): string | null {
  const p = reportCodeSchema.safeParse(raw);
  return p.success ? p.data.toUpperCase() : null;
}

export { sanitizeIncoming };
