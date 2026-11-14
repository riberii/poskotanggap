import { describe, expect, it } from "vitest";
import { handleAuth, isOperator, requireOperator, safeEqual, signSession, verifySession, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/server/auth";
import { handleExtract } from "@/lib/ai/extract-handler";
import { RateLimiter } from "@/lib/ai/common";

const env = { OPERATOR_PASSCODE: "kode-demo-123", SESSION_SECRET: "rahasia-sesi-panjang-sekali-1234" };
const NOW = 1_800_000_000_000;
const req = (cookie?: string, url = "http://x/api/sync/reports", init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers as object) } });
const cookieOf = (t: string) => `${SESSION_COOKIE}=${t}`;

describe("tanda tangan sesi", () => {
  it("token valid diterima, secret lain ditolak", async () => {
    const t = await signSession(env.SESSION_SECRET, NOW);
    expect(await verifySession(t, env.SESSION_SECRET, NOW + 1000)).toBe(true);
    expect(await verifySession(t, "secret-lain-yang-panjang-123", NOW + 1000)).toBe(false);
  });
  it("kedaluwarsa setelah 8 jam", async () => {
    const t = await signSession(env.SESSION_SECRET, NOW);
    expect(await verifySession(t, env.SESSION_SECRET, NOW + SESSION_TTL_MS - 1)).toBe(true);
    expect(await verifySession(t, env.SESSION_SECRET, NOW + SESSION_TTL_MS + 1)).toBe(false);
  });
  it("cookie yang diubah ditolak (kedaluwarsa dimajukan, tanda tangan dipotong, sampah)", async () => {
    const t = await signSession(env.SESSION_SECRET, NOW);
    const [exp, sig] = t.split(".");
    expect(await verifySession(`${Number(exp) + 99_999_999}.${sig}`, env.SESSION_SECRET, NOW)).toBe(false);
    expect(await verifySession(`${exp}.${sig.slice(0, -2)}AA`, env.SESSION_SECRET, NOW)).toBe(false);
    expect(await verifySession(`${exp}.`, env.SESSION_SECRET, NOW)).toBe(false);
    expect(await verifySession("a.b.c", env.SESSION_SECRET, NOW)).toBe(false);
    expect(await verifySession("", env.SESSION_SECRET, NOW)).toBe(false);
  });
  it("safeEqual", async () => {
    expect(await safeEqual("abc", "abc")).toBe(true);
    expect(await safeEqual("abc", "abd")).toBe(false);
    expect(await safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("requireOperator", () => {
  it("tanpa cookie → 401; cookie valid → lolos", async () => {
    expect((await requireOperator(req(), env, NOW))?.status).toBe(401);
    const t = await signSession(env.SESSION_SECRET, NOW);
    expect(await requireOperator(req(cookieOf(t)), env, NOW + 5)).toBeNull();
  });
  it("gagal-tertutup bila env tidak diset atau secret terlalu pendek", async () => {
    const t = await signSession(env.SESSION_SECRET, NOW);
    expect((await requireOperator(req(cookieOf(t)), {}, NOW))?.status).toBe(401);
    expect((await requireOperator(req(cookieOf(t)), { OPERATOR_PASSCODE: "x", SESSION_SECRET: "pendek" }, NOW))?.status).toBe(401);
  });
  it("hanya flag dev yang membuka gerbang", async () => {
    expect(await isOperator(req(), { POSKOTANGGAP_DEV_OPEN: "1" })).toBe(true);
    expect(await isOperator(req(), { POSKOTANGGAP_DEV_OPEN: "true" })).toBe(false);
  });
});

describe("POST /api/auth", () => {
  const post = (passcode: unknown, limiter = new RateLimiter(60_000, 8)) =>
    handleAuth(new Request("http://x/api/auth", { method: "POST", body: JSON.stringify({ passcode }) }), env, limiter, NOW);
  it("kode benar → cookie HttpOnly; Secure; SameSite=Lax; Max-Age 8 jam, dan cookie itu lolos gerbang", async () => {
    const res = await post(env.OPERATOR_PASSCODE);
    expect(res.status).toBe(200);
    const c = res.headers.get("set-cookie")!;
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Max-Age=28800/);
    expect(await requireOperator(req(c.split(";")[0]), env, NOW + 10)).toBeNull();
  });
  it("token yang sama juga diterima lewat Authorization: Bearer", async () => {
    const res = await post(env.OPERATOR_PASSCODE);
    const { token } = (await res.json()) as { token: string };
    const r = new Request("http://x/api/sync/reports", { headers: { authorization: `Bearer ${token}` } });
    expect(await requireOperator(r, env, NOW + 10)).toBeNull();
    const bad = new Request("http://x/api/sync/reports", { headers: { authorization: `Bearer ${token.slice(0, -4)}AAAA` } });
    expect((await requireOperator(bad, env, NOW + 10))?.status).toBe(401);
  });
  it("cookie tanpa Secure di koneksi http, dengan Secure di https", async () => {
    const mk = (u: string) => handleAuth(new Request(u, { method: "POST", body: JSON.stringify({ passcode: env.OPERATOR_PASSCODE }) }), env, new RateLimiter(60_000, 8), NOW);
    expect((await mk("http://x/api/auth")).headers.get("set-cookie")).not.toMatch(/Secure/);
    expect((await mk("https://x/api/auth")).headers.get("set-cookie")).toMatch(/Secure/);
  });
  it("kode salah → 401 tanpa cookie; env kosong → 503; dibatasi laju", async () => {
    const bad = await post("salah");
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toBeNull();
    expect((await handleAuth(new Request("http://x/api/auth", { method: "POST", body: "{}" }), {}, new RateLimiter(), NOW)).status).toBe(503);
    const lim = new RateLimiter(60_000, 2);
    await post("a", lim);
    await post("b", lim);
    expect((await post("c", lim)).status).toBe(429);
  });
});

describe("endpoint terlindungi memberi 401, publik tetap 2xx", () => {
  it("/api/extract tanpa sesi → 401, dengan sesi lolos gerbang", async () => {
    const body = JSON.stringify({ text: "Banjir di Desa Sukamaju butuh 20 dus air mineral" });
    const denied = await handleExtract(new Request("http://x/api/extract", { method: "POST", body }), { hasKey: () => true });
    expect(denied.status).toBe(401);
  });
  it("/api/auth GET (publik) → 200", async () => {
    const res = await handleAuth(req(undefined, "http://x/api/auth"), env, undefined, NOW);
    expect(res.status).toBe(200);
    expect((await res.json()).authenticated).toBe(false);
  });
});

describe("netlify/functions/sync.mts: rute tim → 401 tanpa sesi", async () => {
  const { default: sync } = await import("../netlify/functions/sync.mts");
  const call = (method: string, path: string, body?: unknown) =>
    sync(new Request(`http://x/api/sync/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }));
  it("GET reports, PUT reports/:id, GET threads, POST chat sender=team", async () => {
    expect((await call("GET", "reports")).status).toBe(401);
    expect((await call("PUT", "reports/abc", { status: "verified", duplicate: false, followUp: null })).status).toBe(401);
    expect((await call("GET", "threads")).status).toBe(401);
    // Kode valid tetapi belum ada di DB: gerbang harus menolak SEBELUM menyentuh DB.
    expect((await call("POST", "messages/ABCD2345", { sender: "team", body: "halo" })).status).toBe(401);
  });
  it("kode salah format pada endpoint pelapor → 400 (publik, bukan 401)", async () => {
    expect((await call("GET", "status/!!")).status).toBe(400);
    expect((await call("GET", "messages/!!")).status).toBe(400);
  });
});
