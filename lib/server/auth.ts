// Gerbang operator: kode operator (OPERATOR_PASSCODE) → cookie sesi bertanda tangan HMAC (Web Crypto).
// Gagal-tertutup: bila OPERATOR_PASSCODE atau SESSION_SECRET tidak diset, semua endpoint tim menolak (401).
// Satu-satunya pengecualian: `npm run dev` (scripts/dev-api.mts menyetel POSKOTANGGAP_DEV_OPEN=1).
import { can, type Permission, type Role } from "@/lib/domain/case";
import { RateLimiter, clientKey, errorJson, json, readJsonLimited } from "@/lib/ai/common";

// Nama cookie sesi operator (hanya konstanta, tidak mengubah perilaku).
export const SESSION_COOKIE = "pk_op";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const DEV_OPEN_FLAG = "POSKOTANGGAP_DEV_OPEN";
const MIN_SECRET_CHARS = 16;

export type Env = Record<string, string | undefined>;
export type SessionRole = "operator" | "admin";

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

const hmacKey = (secret: string, usage: KeyUsage[]) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usage);

/** Token = `<kedaluwarsa ms>.<HMAC-SHA256 base64url>` atas "v1.<kedaluwarsa>". */
export async function signSession(secret: string, now = Date.now(), ttlMs = SESSION_TTL_MS, role: SessionRole = "operator"): Promise<string> {
  const exp = String(now + ttlMs);
  // Peran operator tetap memakai pesan lama ("v1.<exp>") agar token lama tetap sah; admin memakai pesan berbeda.
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), enc.encode(role === "admin" ? `v1.admin.${exp}` : `v1.${exp}`));
  return `${exp}.${b64url(sig)}`;
}

export async function verifySession(token: string | null | undefined, secret: string, now = Date.now(), role: SessionRole = "operator"): Promise<boolean> {
  if (!token || secret.length < MIN_SECRET_CHARS) return false;
  const [exp, sig, extra] = token.split(".");
  if (!exp || !sig || extra !== undefined || !/^\d{1,16}$/.test(exp)) return false;
  const sigBytes = fromB64url(sig);
  if (!sigBytes) return false;
  // subtle.verify membandingkan MAC dalam waktu konstan.
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, ["verify"]), sigBytes, enc.encode(role === "admin" ? `v1.admin.${exp}` : `v1.${exp}`));
  return ok && Number(exp) > now;
}

/** Perbandingan waktu konstan: kedua sisi di-hash SHA-256 (panjang sama) lalu dibandingkan dengan XOR. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export const isDevOpen = (env: Env = process.env): boolean => env[DEV_OPEN_FLAG] === "1";
export const isAdminConfigured = (env: Env = process.env): boolean => (env.ADMIN_PASSCODE?.length ?? 0) >= 8;
export const isConfigured = (env: Env = process.env): boolean =>
  Boolean(env.OPERATOR_PASSCODE) && (env.SESSION_SECRET?.length ?? 0) >= MIN_SECRET_CHARS;

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** Peran sesi: admin > operator > null. Admin hanya ada bila ADMIN_PASSCODE diatur (atau mode dev terbuka). */
export async function sessionRole(req: Request, env: Env = process.env, now = Date.now()): Promise<SessionRole | null> {
  if (isDevOpen(env)) return "admin";
  if (!isConfigured(env)) return null;
  // Cookie, atau header Authorization: Bearer <token sesi yang sama> (cadangan bila cookie tidak tersimpan browser).
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const tokens = [readCookie(req, SESSION_COOKIE), bearer];
  for (const t of tokens) if (await verifySession(t, env.SESSION_SECRET!, now, "admin")) return "admin";
  for (const t of tokens) if (await verifySession(t, env.SESSION_SECRET!, now, "operator")) return "operator";
  return null;
}

export async function isOperator(req: Request, env: Env = process.env, now = Date.now()): Promise<boolean> {
  return (await sessionRole(req, env, now)) !== null;
}

/** Wajib punya izin tertentu (peran dicek di server). 401 bila belum masuk, 403 bila peran tidak cukup. */
export async function requirePermission(req: Request, perm: Permission, env: Env = process.env): Promise<{ role: Role } | Response> {
  const role = await sessionRole(req, env);
  if (!role) return errorJson(401, "unauthorized", "Halaman ini khusus tim posko. Masukkan kode operator.");
  if (!can(role, perm)) return errorJson(403, "forbidden", "Peran Anda tidak memiliki izin untuk tindakan ini.");
  return { role };
}

/** Pakai di awal setiap endpoint tim: `const denied = await requireOperator(req); if (denied) return denied;` */
export async function requireOperator(req: Request, env: Env = process.env, now = Date.now()): Promise<Response | null> {
  if (await isOperator(req, env, now)) return null;
  return errorJson(401, "unauthorized", "Halaman ini khusus tim posko. Masukkan kode operator.");
}

/** Secure hanya bila koneksi https; browser membuang cookie Secure dari situs http (mis. URL http://*.netlify.app). */
const isHttps = (req: Request) => {
  // Origin/Referer mencerminkan skema yang dilihat browser; URL fungsi di balik CDN bisa selalu https.
  const seen = req.headers.get("origin") ?? req.headers.get("referer");
  if (seen) return seen.startsWith("https:");
  return (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")).split(",")[0].trim() === "https";
};
const cookieHeader = (req: Request, value: string, maxAgeSec: number) =>
  `${SESSION_COOKIE}=${value}; HttpOnly;${isHttps(req) ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;

const loginLimiter = new RateLimiter(60_000, 8);

/** GET = status sesi; POST {passcode} = masuk; DELETE = keluar. */
export async function handleAuth(req: Request, env: Env = process.env, limiter: RateLimiter = loginLimiter, now = Date.now()): Promise<Response> {
  if (req.method === "GET") {
    const role = await sessionRole(req, env, now);
    return json({ authenticated: role !== null, role, adminEnabled: isDevOpen(env) || isAdminConfigured(env), configured: isConfigured(env), devOpen: isDevOpen(env) });
  }
  if (req.method === "DELETE") {
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": cookieHeader(req, "", 0) } });
  }
  if (req.method !== "POST") return errorJson(405, "method", "Metode tidak didukung.");
  if (isDevOpen(env)) return json({ ok: true, devOpen: true });
  if (!isConfigured(env)) return errorJson(503, "not_configured", "Kode operator belum diatur di server.");
  if (!limiter.allow(clientKey(req))) return errorJson(429, "rate_limited", "Terlalu banyak percobaan. Tunggu satu menit.");
  const body = await readJsonLimited(req, 2_000);
  if (!body.ok) return body.res;
  const passcode = (body.body as { passcode?: unknown } | null)?.passcode;
  if (typeof passcode !== "string" || passcode.length === 0 || passcode.length > 200) return errorJson(401, "bad_passcode", "Kode operator salah.");
  // Kode administrator (opsional) menghasilkan sesi admin; kode operator menghasilkan sesi operator.
  const isAdmin = isAdminConfigured(env) && (await safeEqual(passcode, env.ADMIN_PASSCODE!));
  if (!isAdmin && !(await safeEqual(passcode, env.OPERATOR_PASSCODE!))) return errorJson(401, "bad_passcode", "Kode operator salah.");
  const role: SessionRole = isAdmin ? "admin" : "operator";
  const token = await signSession(env.SESSION_SECRET!, now, SESSION_TTL_MS, role);
  return Response.json({ ok: true, token, role }, { headers: { "Cache-Control": "no-store", "Set-Cookie": cookieHeader(req, token, SESSION_TTL_MS / 1000) } });
}
