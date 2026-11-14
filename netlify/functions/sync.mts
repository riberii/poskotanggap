// Sinkron lintas perangkat: laporan pelapor → antrean tim, status untuk pelapor, dan chat.
// Penyimpanan: Netlify Database. Pesan dan tindak lanjut TIDAK pernah dibaca oleh agregasi kebutuhan.
import { asc, desc, eq, gt, gte, and, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportMessages, syncedReports } from "../../db/schema.js";
import { CHAT_MAX_PER_REPORT, chatPostSchema, type ChatSender } from "../../lib/domain/chat.js";
import { reportCode } from "../../lib/domain/follow-up.js";
import { RateLimiter, clientKey } from "../../lib/ai/common.js";
import { requireOperator } from "../../lib/server/auth.js";
import { addEvents, activeBlock, hashKey, readReporterKey } from "../../lib/server/ops-db.js";
import { detectDanger } from "../../lib/domain/danger.js";
import { detectSpam, normalizeForCompare, EMERGENCY_CONTACTS } from "../../lib/domain/moderation.js";
import { TERMINAL_REJECTED, asCaseStatusLike } from "../../lib/server/sync-rules.js";
import { MAX_BODY_BYTES, parseCode, sanitizeIncoming, statusUpdateSchema, toStatusView } from "../../lib/server/sync-core.js";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const err = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

// Batas laju (best-effort per instance). Pelapor tetap publik; batas khusus pada kegagalan mencegah tebak kode 8 karakter.
const submitLimiter = new RateLimiter(60_000, 10);
const lookupLimiter = new RateLimiter(60_000, 90); // status + chat pelapor (polling 8-10 dtk)
const missLimiter = new RateLimiter(60_000, 8); // "kode tidak ditemukan" per klien
const emergencyLimiter = new RateLimiter(3_600_000, 3); // jalur darurat bagi pelapor yang dibatasi
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
      const who = clientKey(req);
      if (!submitLimiter.allow(who)) return tooMany();
      const body = await readJson(req);
      if (body === "too_big") return err(413, "too_big", "Laporan terlalu besar. Kurangi lampiran.");
      if (body === "bad") return err(400, "bad_json", "Permintaan tidak valid.");
      const s = sanitizeIncoming(body);
      if (!s.ok) return err(400, "invalid", s.message);
      const r = s.report;

      // Identitas perangkat pelapor (kunci acak; hanya hash-nya disimpan). Wajib agar "Laporan saya" dan moderasi berfungsi.
      const rk = readReporterKey(req);
      if (!rk) return err(400, "reporter_key", "Identitas perangkat tidak valid. Muat ulang halaman lalu coba lagi.");
      const reporterHash = await hashKey(rk);
      const emergency = req.headers.get("x-emergency-channel") === "1";

      // Pelapor yang diblokir (manual oleh tim) tetap dapat memakai jalur darurat: laporan masuk, ditandai untuk ditinjau manual.
      const block = await activeBlock(reporterHash);
      if (block && !emergency) {
        return json({ error: { code: "blocked", message: "Pengiriman laporan dari perangkat ini sedang dibatasi oleh tim moderasi.", details: { reason: block.reason, kind: block.kind, expiresAt: block.expiresAt, contacts: EMERGENCY_CONTACTS } } }, 403);
      }
      if (block && emergency && !emergencyLimiter.allow(reporterHash)) return err(429, "rate_limited", "Jalur darurat dibatasi 3 laporan per jam. Hubungi 112 untuk keadaan darurat.");

      // Penanda spam/duplikat (hanya MENANDAI; tidak pernah memblokir otomatis).
      const since = new Date(Date.now() - 10 * 60_000);
      const [{ recent }] = await db.select({ recent: sql<number>`count(*)::int` }).from(syncedReports).where(and(eq(syncedReports.reporterHash, reporterHash), gte(syncedReports.submittedAt, since)));
      const prior = await db
        .select({ t: sql<string>`${syncedReports.payload}->>'rawText'` })
        .from(syncedReports)
        .where(and(eq(syncedReports.reporterHash, reporterHash), gte(syncedReports.submittedAt, new Date(Date.now() - 86_400_000))))
        .limit(30);
      const norm = normalizeForCompare(r.rawText);
      const spam = detectSpam({ text: r.rawText, recentFromReporter: recent, sameTextFromReporter: prior.some((x) => normalizeForCompare(x.t ?? "") === norm) });
      if (recent >= 8) return err(429, "rate_limited", "Terlalu banyak laporan dalam 10 menit. Jika darurat, hubungi 112.");

      const danger = detectDanger(r.rawText).length > 0;
      const priority = spam.suspicious ? "low" : danger ? "high" : "medium";
      const code = reportCode(r.id);
      const inserted = await db
        .insert(syncedReports)
        .values({
          id: r.id, code, payload: r, submittedAt: new Date(r.submittedAt), reporterHash,
          isSimulation: r.simulation === true,
          categoryGroup: r.category?.group ?? null, category: r.category?.code ?? null, customCategory: r.category?.custom ?? null,
          caseStatus: "new", priority, spamFlags: spam.flags, viaEmergencyChannel: !!block && emergency,
        })
        .onConflictDoNothing()
        .returning({ id: syncedReports.id });
      if (inserted.length > 0) {
        await addEvents(code, [
          { kind: "created", actor: "Pelapor", label: r.simulation ? "Laporan SIMULASI diterima" : "Laporan diterima", detail: null },
          ...(spam.flags.length ? [{ kind: "spam", actor: "Sistem", label: `Penanda otomatis: ${spam.flags.join(", ")}`, detail: "Hanya penanda untuk ditinjau manual; tidak ada tindakan otomatis.", visibility: "internal" as const }] : []),
          ...(block ? [{ kind: "moderation", actor: "Sistem", label: "Masuk lewat jalur darurat (pelapor sedang dibatasi)", detail: "Tinjau manual.", visibility: "internal" as const }] : []),
        ]);
      }
      return json({ code }, 201);
    }

    // GET /api/sync/reports — antrean masuk untuk perangkat tim
    if (kind === "reports" && !key && req.method === "GET") {
      const denied = await requireOperator(req);
      if (denied) return denied;
      // Laporan SIMULASI tidak pernah masuk antrean verifikasi kebutuhan / agregasi.
      const rows = await db
        .select({ payload: syncedReports.payload, id: syncedReports.id, status: syncedReports.status, caseStatus: syncedReports.caseStatus })
        .from(syncedReports)
        .where(eq(syncedReports.isSimulation, false))
        .orderBy(desc(syncedReports.submittedAt))
        .limit(100);
      return json({ reports: rows.map((x) => x.payload), statuses: Object.fromEntries(rows.map((x) => [x.id, { status: x.status, caseStatus: x.caseStatus }])) });
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
      const [cur] = await db.select().from(syncedReports).where(eq(syncedReports.id, key)).limit(1);
      if (!cur) return err(404, "not_found", "Laporan belum tersinkron.");
      // Kasus yang ditolak/duplikat/dibatalkan di server tidak boleh dihidupkan lagi lewat alur periksa-kebutuhan.
      const caseStatus = asCaseStatusLike(cur.caseStatus);
      if (TERMINAL_REJECTED.includes(caseStatus) && u.status !== "rejected") return err(409, "case_closed", "Kasus ini sudah ditolak/ditutup oleh tim. Status tidak dapat diubah dari sini.");
      let nextCase = caseStatus;
      const events: Parameters<typeof addEvents>[1] = [];
      if (u.status === "verified" && ["new", "open", "under_review", "awaiting_team", "awaiting_reporter"].includes(caseStatus)) {
        nextCase = "verified";
        events.push({ kind: "status", actor: "Tim · Pemeriksaan", label: "Status kasus: Terverifikasi" });
      } else if (u.status === "rejected" && !TERMINAL_REJECTED.includes(caseStatus)) {
        nextCase = u.duplicate ? "duplicate" : "rejected";
        events.push(u.duplicate
          ? { kind: "status", actor: "Tim · Pemeriksaan", label: "Status kasus: Duplikat", detail: "Dikonfirmasi sebagai duplikat laporan lain." }
          : { kind: "rejected", actor: "Tim · Pemeriksaan", label: "Laporan ditolak", detail: "Tidak lolos pemeriksaan laporan." });
      } else if (u.status === "pending_review" && caseStatus === "new") {
        nextCase = "under_review";
        events.push({ kind: "status", actor: "Tim · Pemeriksaan", label: "Status kasus: Sedang Ditinjau" });
      }
      const rows = await db
        .update(syncedReports)
        .set({
          status: u.status,
          duplicate: u.duplicate,
          caseStatus: nextCase,
          ...(nextCase === "rejected" && caseStatus !== "rejected" ? { rejectionReason: "Tidak lolos pemeriksaan laporan oleh tim." } : {}),
          arrangedAt: u.followUp ? new Date(u.followUp.arrangedAt) : null,
          arrangedNote: u.followUp?.note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(syncedReports.id, key))
        .returning({ id: syncedReports.id, code: syncedReports.code });
      if (rows.length === 0) return err(404, "not_found", "Laporan belum tersinkron.");
      await addEvents(rows[0].code, events);
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
        const [exists] = await db.select({ id: syncedReports.id, hash: syncedReports.reporterHash, caseStatus: syncedReports.caseStatus }).from(syncedReports).where(eq(syncedReports.code, code)).limit(1);
        if (!exists) {
          missLimiter.allow(who);
          return err(404, "not_found", "Laporan belum tersinkron ke posko.");
        }
        if (p.data.sender === "reporter") {
          const rk = readReporterKey(req);
          if (exists.hash && (!rk || (await hashKey(rk)) !== exists.hash)) return err(403, "not_owner", "Pesan hanya dapat dikirim dari perangkat yang mengirim laporan ini.");
          if (exists.hash && (await activeBlock(exists.hash))) return err(403, "blocked", "Pengiriman pesan dari perangkat ini sedang dibatasi. Hubungi 112 untuk keadaan darurat.");
        }

        const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(reportMessages).where(eq(reportMessages.reportCode, code));
        if (n >= CHAT_MAX_PER_REPORT) return err(429, "limit", "Batas pesan untuk laporan ini tercapai.");
        const [m] = await db.insert(reportMessages).values({ reportCode: code, sender: p.data.sender, body: p.data.body }).returning();
        // Balasan pelapor atas permintaan tim mengembalikan bola ke tim.
        if (p.data.sender === "reporter" && exists.caseStatus === "awaiting_reporter") {
          const moved = await db.update(syncedReports).set({ caseStatus: "awaiting_team", updatedAt: new Date() }).where(and(eq(syncedReports.code, code), eq(syncedReports.caseStatus, "awaiting_reporter"))).returning({ id: syncedReports.id });
          if (moved.length) await addEvents(code, [{ kind: "status", actor: "Pelapor", label: "Pelapor membalas — menunggu respons tim" }]);
        }
        if (p.data.sender === "team") await db.update(syncedReports).set({ updatedAt: new Date() }).where(eq(syncedReports.code, code));
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
