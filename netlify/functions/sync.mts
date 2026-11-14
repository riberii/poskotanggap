// Sinkron lintas perangkat: laporan pelapor → antrean tim, status untuk pelapor, dan chat.
// Penyimpanan: Netlify Database. Pesan dan tindak lanjut TIDAK pernah dibaca oleh agregasi kebutuhan.
import { asc, desc, eq, gt, and, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportMessages, syncedReports } from "../../db/schema.js";
import { CHAT_MAX_PER_REPORT, chatPostSchema, type ChatSender } from "../../lib/domain/chat.js";
import { reportCode } from "../../lib/domain/follow-up.js";
import { RateLimiter, clientKey } from "../../lib/ai/common.js";
import { requireOperator } from "../../lib/server/auth.js";
import { MAX_BODY_BYTES, parseCode, sanitizeIncoming, statusUpdateSchema, toStatusView } from "../../lib/server/sync-core.js";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const err = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

// Batas laju (best-effort per instance). Pelapor tetap publik; batas khusus pada kegagalan mencegah tebak kode 8 karakter.
const submitLimiter = new RateLimiter(60_000, 10);
const lookupLimiter = new RateLimiter(60_000, 90); // status + chat pelapor (polling 8-10 dtk)
const missLimiter = new RateLimiter(60_000, 8); // "kode tidak ditemukan" per klien
const tooMany = () => err(429, "rate_limited", "Terlalu banyak permintaan. Tunggu satu menit.");

async function readJson(req: Request): Promise<unknown | "too_big" | "bad"> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return "too_big";
  try {
    return JSON.parse(text);
  } catch {
    return "bad";
  }
}

export default async (req: Request) => {
  const parts = new URL(req.url).pathname.replace(/^\/api\/sync\/?/, "").split("/").filter(Boolean);
  const [kind, key] = parts;

  try {
    // POST /api/sync/reports  — pelapor mengirim laporan (tidak menimpa yang sudah ada)
    if (kind === "reports" && !key && req.method === "POST") {
      if (!submitLimiter.allow(clientKey(req))) return tooMany();
      const body = await readJson(req);
      if (body === "too_big") return err(413, "too_big", "Laporan terlalu besar. Kurangi lampiran.");
      if (body === "bad") return err(400, "bad_json", "Permintaan tidak valid.");
      const s = sanitizeIncoming(body);
      if (!s.ok) return err(400, "invalid", s.message);
      const r = s.report;
      await db
        .insert(syncedReports)
        .values({ id: r.id, code: reportCode(r.id), payload: r, submittedAt: new Date(r.submittedAt) })
        .onConflictDoNothing();
      return json({ code: reportCode(r.id) }, 201);
    }

    // GET /api/sync/reports — antrean masuk untuk perangkat tim
    if (kind === "reports" && !key && req.method === "GET") {
      const denied = await requireOperator(req);
      if (denied) return denied;
      const rows = await db.select({ payload: syncedReports.payload }).from(syncedReports).orderBy(desc(syncedReports.submittedAt)).limit(100);
      return json({ reports: rows.map((x) => x.payload) });
    }

    // PUT /api/sync/reports/:id — tim memperbarui status/tindak lanjut
    if (kind === "reports" && key && req.method === "PUT") {
      const denied = await requireOperator(req);
      if (denied) return denied;
      const body = await readJson(req);
      if (body === "too_big" || body === "bad") return err(400, "bad_json", "Permintaan tidak valid.");
      const p = statusUpdateSchema.safeParse(body);
      if (!p.success) return err(400, "invalid", "Format status tidak valid.");
      const u = p.data;
      const rows = await db
        .update(syncedReports)
        .set({
          status: u.status,
          duplicate: u.duplicate,
          arrangedAt: u.followUp ? new Date(u.followUp.arrangedAt) : null,
          arrangedNote: u.followUp?.note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(syncedReports.id, key))
        .returning({ id: syncedReports.id });
      if (rows.length === 0) return err(404, "not_found", "Laporan belum tersinkron.");
      return json({ ok: true });
    }

    // GET /api/sync/status/:code
    if (kind === "status" && key && req.method === "GET") {
      const who = clientKey(req);
      if (!lookupLimiter.allow(who) || missLimiter.count(who) >= 8) return tooMany();
      const code = parseCode(key);
      if (!code) return err(400, "invalid_code", "Kode laporan terdiri dari 8 huruf/angka.");
      const [row] = await db.select().from(syncedReports).where(eq(syncedReports.code, code)).limit(1);
      if (!row) {
        missLimiter.allow(who);
        return err(404, "not_found", "Kode laporan tidak ditemukan.");
      }
      return json({ view: toStatusView({ ...row, status: row.status as "pending_review" | "verified" | "rejected" }), geo: (row.payload as { geo?: unknown }).geo ?? null });
    }

    // GET|POST /api/sync/messages/:code
    if (kind === "messages" && key) {
      const who = clientKey(req);
      if (!lookupLimiter.allow(who) || missLimiter.count(who) >= 8) return tooMany();
      const code = parseCode(key);
      if (!code) return err(400, "invalid_code", "Kode laporan terdiri dari 8 huruf/angka.");
      if (req.method === "GET") {
        const [exists] = await db.select({ id: syncedReports.id }).from(syncedReports).where(eq(syncedReports.code, code)).limit(1);
        if (!exists) {
          missLimiter.allow(who);
          return err(404, "not_found", "Laporan belum tersinkron ke posko.");
        }

        const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
        const rows = await db
          .select()
          .from(reportMessages)
          .where(and(eq(reportMessages.reportCode, code), gt(reportMessages.id, Number.isFinite(after) ? after : 0)))
          .orderBy(asc(reportMessages.id))
          .limit(CHAT_MAX_PER_REPORT);
        return json({ messages: rows.map((m) => ({ id: m.id, sender: m.sender as ChatSender, body: m.body, createdAt: m.createdAt.toISOString() })) });
      }
      if (req.method === "POST") {
        const body = await readJson(req);
        if (body === "too_big" || body === "bad") return err(400, "bad_json", "Permintaan tidak valid.");
        const p = chatPostSchema.safeParse(body);
        if (!p.success) return err(400, "invalid", p.error.issues[0]?.message ?? "Pesan tidak valid.");
        if (p.data.sender === "team") {
          const denied = await requireOperator(req);
          if (denied) return denied;
        }
        const [exists] = await db.select({ id: syncedReports.id }).from(syncedReports).where(eq(syncedReports.code, code)).limit(1);
        if (!exists) {
          missLimiter.allow(who);
          return err(404, "not_found", "Laporan belum tersinkron ke posko.");
        }

        const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(reportMessages).where(eq(reportMessages.reportCode, code));
        if (n >= CHAT_MAX_PER_REPORT) return err(429, "limit", "Batas pesan untuk laporan ini tercapai.");
        const [m] = await db.insert(reportMessages).values({ reportCode: code, sender: p.data.sender, body: p.data.body }).returning();
        return json({ message: { id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt.toISOString() } }, 201);
      }
    }

    // GET /api/sync/threads — ringkasan utas untuk tim
    if (kind === "threads" && req.method === "GET") {
      const denied = await requireOperator(req);
      if (denied) return denied;
      const rows = await db
        .select({ code: reportMessages.reportCode, sender: reportMessages.sender, at: reportMessages.createdAt })
        .from(reportMessages)
        .orderBy(asc(reportMessages.id));
      const byCode = new Map<string, { code: string; count: number; lastSender: string; lastAt: string }>();
      for (const m of rows) {
        const t = byCode.get(m.code);
        byCode.set(m.code, { code: m.code, count: (t?.count ?? 0) + 1, lastSender: m.sender, lastAt: m.at.toISOString() });
      }
      const list = [...byCode.values()];
      return json({ threads: list });
    }

    return err(404, "not_found", "Rute tidak ditemukan.");
  } catch (e) {
    console.error("[sync] error", e);
    return err(500, "internal_error", "Server sedang bermasalah. Coba lagi.");
  }
};

export const config = { path: "/api/sync/*" };
