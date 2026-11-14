// Akses database bersama untuk sync.mts dan ops.mts: jejak kasus, audit, blokir, kunci pelapor.
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLogs, caseEvents, reporterBlocks } from "../../db/schema.js";
import type { CaseEventView } from "@/lib/domain/case-view";
import { isBlockActive, type BlockKind } from "@/lib/domain/moderation";

export const REPORTER_KEY_HEADER = "x-reporter-key";

/** Kunci pelapor dibuat acak di perangkatnya (≥128 bit). Server hanya menyimpan hash-nya. */
export function readReporterKey(req: Request): string | null {
  const k = req.headers.get(REPORTER_KEY_HEADER)?.trim();
  return k && /^[A-Za-z0-9_-]{22,64}$/.test(k) ? k : null;
}

export async function hashKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`poskotanggap.reporter.v1:${key}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type NewEvent = { kind: string; actor: string; label: string; detail?: string | null; visibility?: "public" | "internal" };

export async function addEvents(code: string, events: NewEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.insert(caseEvents).values(events.map((e) => ({ reportCode: code, kind: e.kind, actor: e.actor, label: e.label, detail: e.detail ?? null, visibility: e.visibility ?? "public" })));
}

export async function audit(role: string, action: string, targetType: string, targetId: string | null, detail?: string | null): Promise<void> {
  await db.insert(auditLogs).values({ actorRole: role, action, targetType, targetId, detail: detail ?? null });
}

export const toEventView = (e: typeof caseEvents.$inferSelect): CaseEventView => ({
  id: e.id,
  kind: e.kind,
  actor: e.actor,
  label: e.label,
  detail: e.detail,
  visibility: e.visibility === "internal" ? "internal" : "public",
  at: e.createdAt.toISOString(),
});

export async function eventsFor(code: string): Promise<CaseEventView[]> {
  const rows = await db.select().from(caseEvents).where(eq(caseEvents.reportCode, code)).orderBy(caseEvents.id).limit(500);
  return rows.map(toEventView);
}

/** Blokir aktif (belum dicabut, belum kedaluwarsa) untuk satu pelapor. */
export async function activeBlock(reporterHash: string) {
  const rows = await db
    .select()
    .from(reporterBlocks)
    .where(and(eq(reporterBlocks.reporterHash, reporterHash), isNull(reporterBlocks.liftedAt), or(eq(reporterBlocks.kind, "permanent"), gt(reporterBlocks.expiresAt, new Date()))))
    .orderBy(desc(reporterBlocks.id))
    .limit(1);
  const b = rows[0];
  if (!b) return null;
  const rec = { kind: b.kind as BlockKind, expiresAt: b.expiresAt?.toISOString() ?? null, liftedAt: null as string | null };
  return isBlockActive(rec) ? { reason: b.reason, kind: rec.kind, expiresAt: rec.expiresAt } : null;
}
