import { z } from "zod";
import { storedExtractionSchema } from "./ai-extraction";
import { FOLLOW_UP_NOTE_MAX } from "./follow-up";
import { categorySchema } from "./categories";
import { geoSchema } from "./geo";
import { reporterContactSchema } from "./reporter";
import { aiInsightSchema, attachmentSchema, MAX_ATTACHMENTS } from "./insight";
import type { Report } from "./types";
import { DUPLICATE_RESOLUTIONS, INCIDENT_TYPES, QUANTITY_BASES, REPORT_STATUSES, UNITS } from "./types";

/** Skema laporan tersimpan (localStorage dan sinkron server). */
export const id = z.string().uuid();
export const iso = z.string().datetime({ offset: true });

const needSchema = z
  .object({
    id,
    reportId: id,
    item: z.string().min(1).max(80),
    quantity: z.number().finite().positive().max(1_000_000).nullable(),
    unit: z.enum(UNITS).nullable(),
    quantityBasis: z.enum(QUANTITY_BASES),
    evidenceQuote: z.string().max(500).nullable(),
    verified: z.boolean(),
  })
  .strict();

export const reportSchema = z
  .object({
    id,
    rawText: z.string().min(1).max(5000),
    submittedAt: iso,
    incidentType: z.enum(INCIDENT_TYPES).nullable(),
    locationText: z.string().max(200).nullable(),
    normalizedArea: z.string().max(200).nullable(),
    status: z.enum(REPORT_STATUSES),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    duplicateOf: id.nullable(),
    duplicateResolution: z.enum(DUPLICATE_RESOLUTIONS).nullable().optional(),
    extraction: storedExtractionSchema.nullable(),
    createdAt: iso,
    verifiedAt: iso.nullable(),
    needs: z.array(needSchema).max(30),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
    aiInsight: aiInsightSchema.nullable().optional(),
    geo: geoSchema.nullable().optional(),
    reporter: reporterContactSchema.nullable().optional(),
    followUp: z.object({ arrangedAt: iso, note: z.string().max(FOLLOW_UP_NOTE_MAX).nullable() }).strict().nullable().optional(),
    category: categorySchema.nullable().optional(),
    simulation: z.boolean().optional(),
  })
  .strict();


/**
 * Sanitasi laporan dari pelapor sebelum disimpan: server TIDAK mempercayai status,
 * kebutuhan terverifikasi, atau tindak lanjut dari klien publik. Semua kembali ke
 * "menunggu review"; hanya operator yang dapat memverifikasi di perangkat tim.
 */
export function sanitizeIncoming(input: unknown): { ok: true; report: Report } | { ok: false; message: string } {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Format laporan tidak valid." };
  const r = parsed.data as Report;
  return {
    ok: true,
    report: {
      ...r,
      status: "pending_review",
      verifiedAt: null,
      duplicateOf: null,
      duplicateResolution: null,
      followUp: null,
      needs: r.needs.map((n) => ({ ...n, verified: false })),
    },
  };
}

