// Pusat Operasi: tiket kasus, banding, pengumuman, moderasi, audit. Penyimpanan: Netlify Database.
// Semua aturan (alur status, banding satu kali, izin peran) ditegakkan DI SINI, bukan di browser.
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import { announcements, auditLogs, caseEvents, reporterBlocks, syncedReports } from "../../db/schema.js";
import { RateLimiter, clientKey } from "../../lib/ai/common.js";
import { parseCode } from "../../lib/server/sync-core.js";
import { requirePermission, sessionRole } from "../../lib/server/auth.js";
import { addEvents, audit, activeBlock, eventsFor, hashKey, readReporterKey, toEventView } from "../../lib/server/ops-db.js";
import { parseListQuery, type ListQuery } from "../../lib/server/ops-query.js";
import {
  ASSIST_NEEDS_TEAM,
  ASSISTANCE_LABELS,
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  INACTIVE_STATUSES,
  ROLE_LABELS,
  THREAT_LABELS,
  appealDecisionSchema,
  appealSchema,
  can,
  canAppeal,
  caseNoteSchema,
  caseUpdateSchema,
  checkAssistanceChange,
  checkCaseTransition,
  coreStatusFor,
  type Role,
} from "../../lib/domain/case.js";
import { asAppeal, asAssistance, asCaseStatus, casesToCsv, categoryOf, maskEmail, maskName, maskPhone, toReporterView, toTeamRow, type CaseRowInput } from "../../lib/domain/case-view.js";
import { announcementActionSchema, announcementInputSchema, type AnnouncementView } from "../../lib/domain/announcements.js";
import { blockInputSchema, unblockSchema, EMERGENCY_CONTACTS } from "../../lib/domain/moderation.js";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
const err = (status: number, code: string, message: string, details?: unknown) => json({ error: { code, message, details: details ?? null } }, status);

const readLimiter = new RateLimiter(60_000, 90);
const writeLimiter = new RateLimiter(60_000, 12);
const missLimiter = new RateLimiter(60_000, 8);
const tooMany = () => err(429, "rate_limited", "Terlalu banyak permintaan. Tunggu satu menit.");

async function body(req: Request): Promise<unknown | typeof BAD> {
  const t = await req.text();
  if (t.length > 20_000) return BAD;
  try {
    return JSON.parse(t);
  } catch {
    return BAD;
  }
}
const BAD = Symbol("bad");
const actorOf = (r: Role) => `Tim · ${ROLE_LABELS[r]}`;
const invalid = (e: { issues: Array<{ message: string }> }) => err(400, "invalid", e.issues[0]?.message ?? "Data tidak valid.");

type Row = typeof syncedReports.$inferSelect;
const rowInput = (r: Row): CaseRowInput => ({ ...r, code: r.code, payload: r.payload });

/** Pemilik laporan: kunci perangkat cocok. Laporan lama tanpa kunci ("legacy") cukup dengan kode. */
async function ownership(r: Row, req: Request): Promise<"owner" | "legacy" | "other"> {
  if (!r.reporterHash) return "legacy";
  const k = readReporterKey(req);
  return k && (await hashKey(k)) === r.reporterHash ? "owner" : "other";
}

const getByCode = async (code: string) => (await db.select().from(syncedReports).where(eq(syncedReports.code, code)).limit(1))[0];

// ---------------------------------------------------------------- daftar kasus (tim)
function filters(q: ListQuery): SQL[] {
  const c: SQL[] = [];
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    c.push(or(ilike(syncedReports.code, like), ilike(sql`${syncedReports.payload}->>'rawText'`, like), ilike(sql`${syncedReports.payload}->>'locationText'`, like), ilike(syncedReports.assignedTeam, like))!);
  }
  if (q.status) c.push(eq(syncedReports.caseStatus, q.status));
  if (q.priority) c.push(eq(syncedReports.priority, q.priority));
  if (q.group) c.push(eq(syncedReports.categoryGroup, q.group));
  if (q.category) c.push(eq(syncedReports.category, q.category));
  if (q.sim === "real") c.push(eq(syncedReports.isSimulation, false));
  if (q.sim === "sim") c.push(eq(syncedReports.isSimulation, true));
  if (q.archived === "0") c.push(isNull(syncedReports.archivedAt));
  if (q.archived === "1") c.push(isNotNull(syncedReports.archivedAt));
  if (q.appeal === "pending") c.push(eq(syncedReports.appealState, "pending"));
  if (q.from) c.push(gte(syncedReports.submittedAt, new Date(`${q.from}T00:00:00+07:00`)));
  if (q.to) c.push(lt(syncedReports.submittedAt, new Date(new Date(`${q.to}T00:00:00+07:00`).getTime() + 86_400_000)));
  return c;
}
const PRIORITY_RANK = sql`CASE ${syncedReports.priority} WHEN 'critical' THEN 3 WHEN 'high' THEN 2 WHEN 'medium' THEN 1 ELSE 0 END`;

async function listCases(q: ListQuery, paged: boolean) {
  const where = and(...filters(q));
  const dir = q.dir === "asc" ? asc : desc;
  const order =
    q.sort === "priority" ? [dir(PRIORITY_RANK), desc(syncedReports.submittedAt)]
    : q.sort === "updated" ? [dir(syncedReports.updatedAt)]
    : q.sort === "status" ? [dir(syncedReports.caseStatus), desc(syncedReports.submittedAt)]
    : [dir(syncedReports.submittedAt)];
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(syncedReports).where(where);
  const base = db.select().from(syncedReports).where(where).orderBy(...order);
  const rows = paged ? await base.limit(q.pageSize).offset((q.page - 1) * q.pageSize) : await base.limit(5000);
  return { total: n, rows: rows.map((r) => toTeamRow(rowInput(r))) };
}

// ---------------------------------------------------------------- pengumuman
const toAnnouncement = (a: typeof announcements.$inferSelect): AnnouncementView => ({
  id: a.id,
  title: a.title,
  body: a.body,
  category: a.category as AnnouncementView["category"],
  sourceKind: a.sourceKind as AnnouncementView["sourceKind"],
  sourceAgency: (a.sourceAgency as AnnouncementView["sourceAgency"]) ?? null,
  sourceName: a.sourceName,
  sourceRef: a.sourceRef,
  status: a.status as AnnouncementView["status"],
  publishAt: a.publishAt?.toISOString() ?? null,
  publishedAt: a.publishedAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

export default async (req: Request) => {
  const parts = new URL(req.url).pathname.replace(/^\/api\/ops\/?/, "").split("/").filter(Boolean);
  const [area, a1, a2, a3] = parts;
  const url = new URL(req.url);
  const who = clientKey(req);

  try {
    // =============================================================== PUBLIK (pelapor)
    if (area === "announcements" && !a1 && req.method === "GET") {
      if (!readLimiter.allow(who)) return tooMany();
      const rows = await db
        .select()
        .from(announcements)
        .where(or(eq(announcements.status, "published"), and(eq(announcements.status, "scheduled"), sql`${announcements.publishAt} <= now()`)))
        .orderBy(desc(sql`coalesce(${announcements.publishAt}, ${announcements.publishedAt})`))
        .limit(50);
      return json({ announcements: rows.map(toAnnouncement) });
    }

    if (area === "block-status" && req.method === "GET") {
      const key = readReporterKey(req);
      const b = key ? await activeBlock(await hashKey(key)) : null;
      return json({ blocked: !!b, block: b, contacts: EMERGENCY_CONTACTS });
    }

    // GET /mine — semua laporan milik perangkat ini (tanpa mengetik kode)
    if (area === "mine" && req.method === "GET") {
      if (!readLimiter.allow(who)) return tooMany();
      const key = readReporterKey(req);
      const extra = (url.searchParams.get("codes") ?? "").split(",").map((c) => parseCode(c.trim())).filter((c): c is string => !!c).slice(0, 30);
      const conds: SQL[] = [];
      if (key) conds.push(eq(syncedReports.reporterHash, await hashKey(key)));
      if (extra.length) conds.push(inArray(syncedReports.code, extra));
      if (conds.length === 0) return json({ cases: [] });
      const rows = await db.select().from(syncedReports).where(or(...conds)).orderBy(desc(syncedReports.submittedAt)).limit(100);
      const ev = rows.length ? await db.select().from(caseEvents).where(and(inArray(caseEvents.reportCode, rows.map((r) => r.code)), eq(caseEvents.visibility, "public"))).orderBy(asc(caseEvents.id)) : [];
      const by = new Map<string, ReturnType<typeof toEventView>[]>();
      for (const e of ev) by.set(e.reportCode, [...(by.get(e.reportCode) ?? []), toEventView(e)]);
      const cases = [];
      for (const r of rows) {
        const own = await ownership(r, req);
        const v = toReporterView(rowInput(r), by.get(r.code) ?? []);
        // Banding/pembatalan hanya dari perangkat pemilik laporan.
        if (own === "other") {
          v.appeal.canAppeal = false;
          v.canCancel = false;
        }
        cases.push(v);
      }
      return json({ cases });
    }

    if (area === "case" && a1 && !a2 && req.method === "GET") {
      if (!readLimiter.allow(who) || missLimiter.count(who) >= 8) return tooMany();
      const code = parseCode(a1);
      if (!code) return err(400, "invalid_code", "Kode laporan terdiri dari 8 huruf/angka.");
      const r = await getByCode(code);
      if (!r) {
        missLimiter.allow(who);
        return err(404, "not_found", "Kode laporan tidak ditemukan.");
      }
      const v = toReporterView(rowInput(r), await eventsFor(code));
      if ((await ownership(r, req)) === "other") {
        v.appeal.canAppeal = false;
        v.canCancel = false;
      }
      return json({ case: v });
    }

    // POST /case/:code/appeal — TEPAT SATU kali. Pengaman atomik: UPDATE bersyarat pada appeal_state = 'none'.
    if (area === "case" && a1 && a2 === "appeal" && req.method === "POST") {
      if (!writeLimiter.allow(who)) return tooMany();
      const code = parseCode(a1);
      if (!code) return err(400, "invalid_code", "Kode laporan tidak valid.");
      const b = await body(req);
      if (b === BAD) return err(400, "bad_json", "Permintaan tidak valid.");
      const p = appealSchema.safeParse(b);
      if (!p.success) return invalid(p.error);
      const r = await getByCode(code);
      if (!r) return err(404, "not_found", "Kode laporan tidak ditemukan.");
      if ((await ownership(r, req)) === "other") return err(403, "not_owner", "Banding hanya dapat diajukan dari perangkat yang mengirim laporan ini.");
      const rule = canAppeal(asCaseStatus(r.caseStatus), asAppeal(r.appealState));
      if (!rule.ok) return err(409, rule.code, rule.message);
      const done = await db
        .update(syncedReports)
        .set({ appealState: "pending", appealMessage: p.data.message, appealAt: new Date(), updatedAt: new Date() })
        .where(and(eq(syncedReports.code, code), eq(syncedReports.caseStatus, "rejected"), eq(syncedReports.appealState, "none")))
        .returning({ id: syncedReports.id });
      if (done.length === 0) return err(409, "appeal_used", "Kesempatan banding sudah dipakai dan tidak dapat diulang.");
      await addEvents(code, [{ kind: "appeal_filed", actor: "Pelapor", label: "Banding diajukan", detail: p.data.message }]);
      return json({ ok: true }, 201);
    }

    // POST /case/:code/cancel — pelapor membatalkan laporannya sendiri
    if (area === "case" && a1 && a2 === "cancel" && req.method === "POST") {
      if (!writeLimiter.allow(who)) return tooMany();
      const code = parseCode(a1);
      if (!code) return err(400, "invalid_code", "Kode laporan tidak valid.");
      const r = await getByCode(code);
      if (!r) return err(404, "not_found", "Kode laporan tidak ditemukan.");
      if ((await ownership(r, req)) !== "owner") return err(403, "not_owner", "Pembatalan hanya dari perangkat yang mengirim laporan ini.");
      const from = asCaseStatus(r.caseStatus);
      if (!toReporterView(rowInput(r), []).canCancel) return err(409, "not_cancellable", `Laporan berstatus “${CASE_STATUS_LABELS[from]}” tidak dapat dibatalkan.`);
      if (asAssistance(r.assistanceStatus) !== "none") return err(409, "assistance_active", "Bantuan sudah diatur. Hubungi tim lewat pesan untuk membatalkan.");
      const done = await db
        .update(syncedReports)
        .set({ caseStatus: "cancelled", status: "rejected", updatedAt: new Date() })
        .where(and(eq(syncedReports.code, code), eq(syncedReports.caseStatus, r.caseStatus)))
        .returning({ id: syncedReports.id });
      if (done.length === 0) return err(409, "conflict", "Status laporan baru saja berubah. Muat ulang.");
      await addEvents(code, [{ kind: "status", actor: "Pelapor", label: "Laporan dibatalkan oleh pelapor" }]);
      return json({ ok: true });
    }

    // =============================================================== TIM
    if (area === "me" && req.method === "GET") {
      const role = await sessionRole(req);
      if (!role) return err(401, "unauthorized", "Masukkan kode operator.");
      return json({ role, roleLabel: ROLE_LABELS[role] });
    }

    // ---------- kasus
    if (area === "cases" && !a1 && req.method === "GET") {
      const g = await requirePermission(req, "case.read");
      if (g instanceof Response) return g;
      const q = parseListQuery(url.searchParams);
      if (!q.success) return invalid(q.error);
      const { total, rows } = await listCases(q.data, true);
      const counts = await db.select({ s: syncedReports.caseStatus, n: sql<number>`count(*)::int` }).from(syncedReports).where(isNull(syncedReports.archivedAt)).groupBy(syncedReports.caseStatus);
      const [pa] = await db.select({ n: sql<number>`count(*)::int` }).from(syncedReports).where(eq(syncedReports.appealState, "pending"));
      return json({ total, page: q.data.page, pageSize: q.data.pageSize, rows, counts: Object.fromEntries(counts.map((c) => [c.s, c.n])), pendingAppeals: pa.n });
    }

    if (area === "cases" && a1 === "export" && req.method === "GET") {
      const g = await requirePermission(req, "export");
      if (g instanceof Response) return g;
      const q = parseListQuery(url.searchParams);
      if (!q.success) return invalid(q.error);
      const { rows } = await listCases(q.data, false);
      await audit(g.role, "export.csv", "cases", null, `${rows.length} baris (tanpa data kontak pelapor)`);
      return new Response(casesToCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="kasus-poskotanggap.csv"', "Cache-Control": "no-store" } });
    }
    if (area === "cases" && a1 === "export-json" && req.method === "GET") {
      const g = await requirePermission(req, "export");
      if (g instanceof Response) return g;
      const q = parseListQuery(url.searchParams);
      if (!q.success) return invalid(q.error);
      const { rows } = await listCases(q.data, false);
      await audit(g.role, "export.pdf", "cases", null, `${rows.length} baris (tanpa data kontak pelapor)`);
      return json({ rows, generatedAt: new Date().toISOString() });
    }

    if (area === "cases" && a1 && !a2 && req.method === "GET") {
      const g = await requirePermission(req, "case.read");
      if (g instanceof Response) return g;
      const code = parseCode(a1);
      if (!code) return err(400, "invalid_code", "Kode tidak valid.");
      const r = await getByCode(code);
      if (!r) return err(404, "not_found", "Kasus tidak ditemukan.");
      const payload = r.payload as { rawText: string; locationText: string | null; attachments?: unknown[]; needs?: unknown[]; geo?: unknown; reporter?: { name: string | null; email: string | null; phone: string | null } | null; aiInsight?: unknown };
      const c = payload.reporter;
      const blocks = r.reporterHash ? await db.select().from(reporterBlocks).where(eq(reporterBlocks.reporterHash, r.reporterHash)).orderBy(desc(reporterBlocks.id)) : [];
      const [others] = r.reporterHash ? await db.select({ n: sql<number>`count(*)::int` }).from(syncedReports).where(eq(syncedReports.reporterHash, r.reporterHash)) : [{ n: 1 }];
      return json({
        row: toTeamRow(rowInput(r)),
        coreStatus: r.status,
        rawText: payload.rawText,
        attachments: payload.attachments ?? [],
        needs: payload.needs ?? [],
        geo: payload.geo ?? null,
        aiInsight: payload.aiInsight ?? null,
        // Kontak disamarkan; tampilan penuh lewat POST …/reveal-contact (tercatat di audit).
        contact: c ? { name: c.name ? maskName(c.name) : null, email: c.email ? maskEmail(c.email) : null, phone: c.phone ? maskPhone(c.phone) : null } : null,
        rejectionReason: r.rejectionReason,
        appeal: { state: asAppeal(r.appealState), message: r.appealMessage, at: r.appealAt?.toISOString() ?? null, decisionNote: r.appealDecisionNote, decidedAt: r.appealDecidedAt?.toISOString() ?? null },
        viaEmergencyChannel: r.viaEmergencyChannel,
        reporterReports: others.n,
        hasReporterId: !!r.reporterHash,
        blocks: blocks.map((b) => ({ id: b.id, kind: b.kind, reason: b.reason, createdAt: b.createdAt.toISOString(), expiresAt: b.expiresAt?.toISOString() ?? null, liftedAt: b.liftedAt?.toISOString() ?? null, liftReason: b.liftReason })),
        activeBlock: r.reporterHash ? await activeBlock(r.reporterHash) : null,
        events: await eventsFor(code),
        permissions: { update: can(g.role, "case.update"), blockTemporary: can(g.role, "moderation.block_temporary"), blockPermanent: can(g.role, "moderation.block_permanent"), unblock: can(g.role, "moderation.unblock") },
      });
    }

    if (area === "cases" && a1 && a2 === "reveal-contact" && req.method === "POST") {
      const g = await requirePermission(req, "case.read");
      if (g instanceof Response) return g;
      const code = parseCode(a1);
      const r = code ? await getByCode(code) : undefined;
      if (!r) return err(404, "not_found", "Kasus tidak ditemukan.");
      await audit(g.role, "contact.reveal", "case", r.code, "Kontak pelapor ditampilkan lengkap");
      return json({ contact: (r.payload as { reporter?: unknown }).reporter ?? null });
    }

    if (area === "cases" && a1 && !a2 && req.method === "PATCH") {
      const g = await requirePermission(req, "case.update");
      if (g instanceof Response) return g;
      const code = parseCode(a1);
      const r = code ? await getByCode(code) : undefined;
      if (!code || !r) return err(404, "not_found", "Kasus tidak ditemukan.");
      const b = await body(req);
      if (b === BAD) return err(400, "bad_json", "Permintaan tidak valid.");
      const p = caseUpdateSchema.safeParse(b);
      if (!p.success) return invalid(p.error);
      const u = p.data;
      const actor = actorOf(g.role);
      const set: Partial<typeof syncedReports.$inferInsert> = { updatedAt: new Date() };
      const events: Parameters<typeof addEvents>[1] = [];
      const fromStatus = asCaseStatus(r.caseStatus);
      let nextStatus = fromStatus;
      const team = u.assignedTeam !== undefined ? (u.assignedTeam?.trim() || null) : r.assignedTeam;
      const fail = (rule: { code: string; message: string }) => err(rule.code === "reason_required" ? 422 : 409, rule.code, rule.message);

      if (u.caseStatus && u.caseStatus !== fromStatus) {
        const rule = checkCaseTransition(fromStatus, u.caseStatus, u.reason);
        if (!rule.ok) return fail(rule);
        const assist = asAssistance(r.assistanceStatus);
        if (INACTIVE_STATUSES.includes(u.caseStatus) && assist !== "none" && assist !== "completed") {
          return err(409, "assistance_active", "Selesaikan atau hentikan status bantuan sebelum menutup kasus ini.");
        }
        nextStatus = u.caseStatus;
        set.caseStatus = nextStatus;
        set.status = coreStatusFor(nextStatus, r.status as "pending_review" | "verified" | "rejected");
        set.duplicate = nextStatus === "duplicate";
        if (nextStatus === "rejected") set.rejectionReason = u.reason!.trim();
        if (nextStatus === "verified" && !r.priority) set.priority = "medium";
        events.push({ kind: "status", actor, label: `Status kasus: ${CASE_STATUS_LABELS[nextStatus]}`, detail: u.reason?.trim() || u.note?.trim() || null });
        if (nextStatus === "rejected") events[events.length - 1] = { kind: "rejected", actor, label: "Laporan ditolak", detail: u.reason!.trim() };
      }
      if (u.assignedTeam !== undefined && team !== r.assignedTeam) {
        const assist = asAssistance(u.assistanceStatus ?? r.assistanceStatus);
        if (!team && ASSIST_NEEDS_TEAM.includes(assist) && assist !== "completed") return err(409, "team_required", "Tim tidak dapat dikosongkan saat bantuan sedang ditugaskan.");
        set.assignedTeam = team;
        events.push({ kind: "assign", actor, label: team ? `Tim ditugaskan: ${team}` : "Penugasan tim dilepas" });
      }
      if (u.assignedResponder !== undefined && (u.assignedResponder?.trim() || null) !== r.assignedResponder) {
        set.assignedResponder = u.assignedResponder?.trim() || null;
        events.push({ kind: "assign", actor, label: set.assignedResponder ? `Petugas ditugaskan: ${set.assignedResponder}` : "Petugas dilepas", visibility: "internal" });
      }
      if (u.assistanceStatus && u.assistanceStatus !== asAssistance(r.assistanceStatus)) {
        const rule = checkAssistanceChange(nextStatus, asAssistance(r.assistanceStatus), u.assistanceStatus, team);
        if (!rule.ok) return fail(rule);
        set.assistanceStatus = u.assistanceStatus;
        events.push({ kind: "assistance", actor, label: `Status bantuan: ${ASSISTANCE_LABELS[u.assistanceStatus]}`, detail: u.note?.trim() || null });
      }
      if (u.priority && u.priority !== r.priority) {
        set.priority = u.priority;
        events.push({ kind: "priority", actor, label: `Prioritas: ${CASE_PRIORITY_LABELS[u.priority]}`, visibility: "internal" });
      }
      if (u.threatLevel && u.threatLevel !== r.threatLevel) {
        set.threatLevel = u.threatLevel;
        events.push({ kind: "threat", actor, label: `Tingkat ancaman: ${THREAT_LABELS[u.threatLevel]}`, visibility: "internal" });
      }
      if (u.isSimulation !== undefined && u.isSimulation !== r.isSimulation) {
        set.isSimulation = u.isSimulation;
        events.push({ kind: "label", actor, label: u.isSimulation ? "Ditandai sebagai SIMULASI" : "Ditandai sebagai laporan nyata", visibility: "internal" });
      }
      if (u.archived !== undefined && u.archived !== !!r.archivedAt) {
        if (u.archived && !INACTIVE_STATUSES.includes(nextStatus)) return err(409, "archive_active", "Hanya kasus yang sudah selesai/ditolak/dibatalkan yang dapat diarsipkan.");
        set.archivedAt = u.archived ? new Date() : null;
        events.push({ kind: "archive", actor, label: u.archived ? "Kasus diarsipkan" : "Arsip kasus dibuka", visibility: "internal" });
      }
      if (u.note?.trim() && !events.some((e) => e.detail === u.note!.trim())) events.push({ kind: "note", actor, label: "Catatan internal", detail: u.note.trim(), visibility: "internal" });
      if (events.length === 0) return err(400, "no_change", "Tidak ada perubahan untuk disimpan.");

      // Penjaga optimistik: hanya berhasil bila kasus belum berubah sejak dibaca.
      const done = await db
        .update(syncedReports)
        .set(set)
        .where(and(eq(syncedReports.code, code), eq(syncedReports.caseStatus, r.caseStatus), eq(syncedReports.appealState, r.appealState), eq(syncedReports.assistanceStatus, r.assistanceStatus)))
        .returning({ id: syncedReports.id });
      if (done.length === 0) return err(409, "conflict", "Kasus baru saja diubah pihak lain. Muat ulang lalu coba lagi.");
      await addEvents(code, events);
      await audit(g.role, "case.update", "case", code, events.map((e) => e.label).join(" | "));
      return json({ ok: true });
    }

    if (area === "cases" && a1 && a2 === "notes" && req.method === "POST") {
      const g = await requirePermission(req, "case.note");
      if (g instanceof Response) return g;
      const code = parseCode(a1);
      const r = code ? await getByCode(code) : undefined;
      if (!code || !r) return err(404, "not_found", "Kasus tidak ditemukan.");
      const p = caseNoteSchema.safeParse(await body(req));
      if (!p.success) return invalid(p.error);
      await addEvents(code, [{ kind: "note", actor: actorOf(g.role), label: "Catatan internal", detail: p.data.note, visibility: "internal" }]);
      await audit(g.role, "case.note", "case", code, null);
      return json({ ok: true }, 201);
    }

    if (area === "cases" && a1 && a2 === "appeal-decision" && req.method === "POST") {
      const g = await requirePermission(req, "case.update");
      if (g instanceof Response) return g;
      const code = parseCode(a1);
      const r = code ? await getByCode(code) : undefined;
      if (!code || !r) return err(404, "not_found", "Kasus tidak ditemukan.");
      const p = appealDecisionSchema.safeParse(await body(req));
      if (!p.success) return invalid(p.error);
      if (r.appealState !== "pending" || r.caseStatus !== "rejected") return err(409, "no_pending_appeal", "Tidak ada banding yang menunggu keputusan.");
      const approve = p.data.decision === "approve";
      const done = await db
        .update(syncedReports)
        .set({
          appealState: approve ? "approved" : "rejected",
          appealDecisionNote: p.data.note,
          appealDecidedAt: new Date(),
          updatedAt: new Date(),
          ...(approve ? { caseStatus: "reopened", status: "pending_review", duplicate: false } : {}),
        })
        .where(and(eq(syncedReports.code, code), eq(syncedReports.appealState, "pending"), eq(syncedReports.caseStatus, "rejected")))
        .returning({ id: syncedReports.id });
      if (done.length === 0) return err(409, "conflict", "Banding sudah diputuskan. Muat ulang.");
      await addEvents(code, [
        approve
          ? { kind: "appeal_approved", actor: actorOf(g.role), label: "Banding disetujui — kasus dibuka kembali", detail: p.data.note }
          : { kind: "appeal_rejected", actor: actorOf(g.role), label: "Banding ditolak — keputusan final, tidak dapat dibanding lagi", detail: p.data.note },
      ]);
      await audit(g.role, approve ? "appeal.approve" : "appeal.reject", "case", code, p.data.note);
      return json({ ok: true });
    }

    // ---------- pengumuman (tim)
    if (area === "announcements" && a1 === "all" && req.method === "GET") {
      const g = await requirePermission(req, "announcement.manage");
      if (g instanceof Response) return g;
      const rows = await db.select().from(announcements).orderBy(desc(announcements.updatedAt)).limit(200);
      return json({ announcements: rows.map(toAnnouncement), canOfficial: can(g.role, "announcement.official") });
    }
    if (area === "announcements" && !a1 && req.method === "POST") {
      const g = await requirePermission(req, "announcement.manage");
      if (g instanceof Response) return g;
      const p = announcementInputSchema.safeParse(await body(req));
      if (!p.success) return invalid(p.error);
      const d = p.data;
      if (d.sourceKind === "official" && !can(g.role, "announcement.official")) return err(403, "forbidden", "Hanya administrator yang dapat memasukkan pengumuman bersumber resmi.");
      const id = crypto.randomUUID();
      await db.insert(announcements).values({
        id, title: d.title, body: d.body, category: d.category, sourceKind: d.sourceKind,
        sourceAgency: d.sourceKind === "official" ? (d.sourceAgency ?? null) : null,
        sourceName: d.sourceKind === "official" ? (d.sourceName ?? null) : null,
        sourceRef: d.sourceKind === "official" ? (d.sourceRef ?? null) : null,
        publishAt: d.publishAt ? new Date(d.publishAt) : null, status: "draft", createdBy: g.role,
      });
      await audit(g.role, "announcement.create", "announcement", id, d.title);
      return json({ id }, 201);
    }
    if (area === "announcements" && a1 && !a2 && req.method === "PUT") {
      const g = await requirePermission(req, "announcement.manage");
      if (g instanceof Response) return g;
      const p = announcementInputSchema.safeParse(await body(req));
      if (!p.success) return invalid(p.error);
      const d = p.data;
      const [cur] = await db.select().from(announcements).where(eq(announcements.id, a1)).limit(1);
      if (!cur) return err(404, "not_found", "Pengumuman tidak ditemukan.");
      if (cur.status === "archived") return err(409, "archived", "Pengumuman yang diarsipkan tidak dapat diubah. Pulihkan dulu.");
      if ((d.sourceKind === "official" || cur.sourceKind === "official") && !can(g.role, "announcement.official")) return err(403, "forbidden", "Hanya administrator yang dapat mengubah pengumuman bersumber resmi.");
      await db.update(announcements).set({
        title: d.title, body: d.body, category: d.category, sourceKind: d.sourceKind,
        sourceAgency: d.sourceKind === "official" ? (d.sourceAgency ?? null) : null,
        sourceName: d.sourceKind === "official" ? (d.sourceName ?? null) : null,
        sourceRef: d.sourceKind === "official" ? (d.sourceRef ?? null) : null,
        publishAt: d.publishAt ? new Date(d.publishAt) : cur.status === "scheduled" ? cur.publishAt : null, updatedAt: new Date(),
      }).where(eq(announcements.id, a1));
      await audit(g.role, "announcement.edit", "announcement", a1, d.title);
      return json({ ok: true });
    }
    if (area === "announcements" && a1 && a2 === "action" && req.method === "POST") {
      const g = await requirePermission(req, "announcement.manage");
      if (g instanceof Response) return g;
      const p = announcementActionSchema.safeParse(await body(req));
      if (!p.success) return invalid(p.error);
      const [cur] = await db.select().from(announcements).where(eq(announcements.id, a1)).limit(1);
      if (!cur) return err(404, "not_found", "Pengumuman tidak ditemukan.");
      if (cur.sourceKind === "official" && p.data.action !== "archive" && !can(g.role, "announcement.official")) return err(403, "forbidden", "Hanya administrator yang dapat menerbitkan pengumuman bersumber resmi.");
      const now = new Date();
      let set: Partial<typeof announcements.$inferInsert>;
      switch (p.data.action) {
        case "publish":
          if (cur.status === "archived") return err(409, "archived", "Pulihkan pengumuman dari arsip dulu.");
          set = { status: "published", publishedAt: now, publishAt: null };
          break;
        case "schedule": {
          const at = p.data.publishAt ?? cur.publishAt?.toISOString();
          if (!at || new Date(at).getTime() <= now.getTime() + 30_000) return err(422, "bad_schedule", "Waktu terbit harus di masa depan.");
          if (cur.status === "archived") return err(409, "archived", "Pulihkan pengumuman dari arsip dulu.");
          set = { status: "scheduled", publishAt: new Date(at) };
          break;
        }
        case "archive":
          set = { status: "archived" };
          break;
        case "unarchive":
          if (cur.status !== "archived") return err(409, "not_archived", "Pengumuman tidak sedang diarsipkan.");
          set = { status: "draft", publishAt: null };
          break;
        default:
          set = { status: "draft" };
      }
      await db.update(announcements).set({ ...set, updatedAt: now }).where(eq(announcements.id, a1));
      await audit(g.role, `announcement.${p.data.action}`, "announcement", a1, cur.title);
      return json({ ok: true });
    }

    // ---------- moderasi
    if (area === "moderation" && a1 === "blocks" && !a2 && req.method === "GET") {
      const g = await requirePermission(req, "moderation.read");
      if (g instanceof Response) return g;
      const rows = await db.select().from(reporterBlocks).orderBy(desc(reporterBlocks.id)).limit(200);
      const now = Date.now();
      return json({
        canUnblock: can(g.role, "moderation.unblock"),
        blocks: rows.map((b) => ({
          id: b.id, reportCode: b.reportCode, kind: b.kind, reason: b.reason, createdBy: b.createdBy, createdAt: b.createdAt.toISOString(),
          expiresAt: b.expiresAt?.toISOString() ?? null, liftedAt: b.liftedAt?.toISOString() ?? null, liftedBy: b.liftedBy, liftReason: b.liftReason,
          active: !b.liftedAt && (b.kind === "permanent" || (!!b.expiresAt && b.expiresAt.getTime() > now)),
        })),
      });
    }
    if (area === "moderation" && a1 === "block" && req.method === "POST") {
      const auth = await requirePermission(req, "moderation.block_temporary");
      if (auth instanceof Response) return auth;
      const p = blockInputSchema.safeParse(await body(req));
      if (!p.success) return invalid(p.error);
      const d = p.data;
      if (d.kind === "permanent" && !can(auth.role, "moderation.block_permanent")) return err(403, "forbidden", "Blokir permanen hanya dapat ditetapkan administrator.");
      const code = d.reportCode.toUpperCase();
      const r = await getByCode(code);
      if (!r) return err(404, "not_found", "Laporan dasar tidak ditemukan.");
      if (!r.reporterHash) return err(422, "no_identity", "Laporan ini tidak memiliki identitas perangkat, sehingga pelapornya tidak dapat diblokir.");
      if (await activeBlock(r.reporterHash)) return err(409, "already_blocked", "Pelapor ini sudah diblokir.");
      const expiresAt = d.kind === "temporary" ? new Date(Date.now() + d.hours! * 3_600_000) : null;
      await db.insert(reporterBlocks).values({ reporterHash: r.reporterHash, reportCode: code, kind: d.kind, reason: d.reason, createdBy: auth.role, expiresAt });
      await addEvents(code, [{ kind: "moderation", actor: actorOf(auth.role), label: `Pelapor diblokir (${d.kind === "permanent" ? "permanen" : `${d.hours} jam`})`, detail: d.reason, visibility: "internal" }]);
      await audit(auth.role, d.kind === "permanent" ? "block.permanent" : "block.temporary", "reporter", code, d.reason);
      return json({ ok: true }, 201);
    }
    if (area === "moderation" && a1 === "blocks" && a2 && a3 === "unblock" && req.method === "POST") {
      const g = await requirePermission(req, "moderation.unblock");
      if (g instanceof Response) return g;
      const p = unblockSchema.safeParse(await body(req));
      if (!p.success) return invalid(p.error);
      const id = Number(a2);
      if (!Number.isInteger(id)) return err(400, "invalid_id", "ID blokir tidak valid.");
      const done = await db
        .update(reporterBlocks)
        .set({ liftedAt: new Date(), liftedBy: g.role, liftReason: p.data.reason })
        .where(and(eq(reporterBlocks.id, id), isNull(reporterBlocks.liftedAt)))
        .returning({ code: reporterBlocks.reportCode });
      if (done.length === 0) return err(409, "not_active", "Blokir ini sudah dicabut atau tidak ada.");
      if (done[0].code) await addEvents(done[0].code, [{ kind: "moderation", actor: actorOf(g.role), label: "Blokir pelapor dicabut", detail: p.data.reason, visibility: "internal" }]);
      await audit(g.role, "block.unblock", "reporter", done[0].code, p.data.reason);
      return json({ ok: true });
    }

    if (area === "audit" && req.method === "GET") {
      const g = await requirePermission(req, "audit.read");
      if (g instanceof Response) return g;
      const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
      const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(100).offset(offset);
      return json({ rows: rows.map((a) => ({ id: a.id, role: a.actorRole, action: a.action, targetType: a.targetType, targetId: a.targetId, detail: a.detail, at: a.createdAt.toISOString() })) });
    }

    return err(404, "not_found", "Rute tidak ditemukan.");
  } catch (e) {
    console.error("[ops] error", e);
    return err(500, "internal_error", "Server sedang bermasalah. Coba lagi.");
  }
};

export const config = { path: "/api/ops/*" };
