// Utilitas bersama handler AI (server). Tidak diimpor oleh kode browser.
import { GoogleGenAI } from "@google/genai";

export const DEFAULT_MODEL = "gemini-3.5-flash";
export const getModel = (): string => process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

let client: GoogleGenAI | null = null;
/**
 * Kredensial hanya dari env server. Urutan: GEMINI_API_KEY (+ GOOGLE_GEMINI_BASE_URL) bila ada;
 * jika tidak, variabel AI Gateway Netlify. Di runtime Netlify keduanya disuntik otomatis.
 */
export function getClient(): GoogleGenAI {
  if (client) return client;
  const gw = process.env.NETLIFY_AI_GATEWAY_KEY;
  client =
    !process.env.GEMINI_API_KEY && gw
      ? new GoogleGenAI({ apiKey: gw, httpOptions: { baseUrl: process.env.NETLIFY_AI_GATEWAY_URL?.replace(/\/$/, "") } })
      : new GoogleGenAI({});
  return client;
}

/** Apakah ada kredensial AI di env server (tanpa membaca nilainya ke log). */
export const hasAiCredentials = (): boolean => Boolean(process.env.GEMINI_API_KEY || process.env.NETLIFY_AI_GATEWAY_KEY);

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const errorJson = (status: number, code: string, message: string): Response =>
  json({ error: { code, message } }, status);

export function clientKey(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-nf-client-connection-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

/** Batas laju per klien (best-effort, per instance). Hanya pelindung biaya. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private windowMs = 60_000, private max = 12) {}
  /** Jumlah kejadian di jendela saat ini tanpa mencatat yang baru. */
  count(key: string, now = Date.now()): number {
    return (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs).length;
  }
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}

/** Cache kecil berbasis hash dengan batas ukuran (FIFO). */
export class HashCache<T> {
  private map = new Map<string, T>();
  constructor(private limit = 200) {}
  get(k: string) { return this.map.get(k); }
  set(k: string, v: T) {
    if (this.map.size >= this.limit) this.map.delete(this.map.keys().next().value as string);
    this.map.set(k, v);
  }
}

export async function readJsonLimited(req: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) return { ok: false, res: errorJson(413, "too_large", "Permintaan terlalu besar.") };
  const raw = await req.text();
  if (raw.length > maxBytes) return { ok: false, res: errorJson(413, "too_large", "Permintaan terlalu besar.") };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, res: errorJson(400, "bad_json", "Permintaan tidak valid.") };
  }
}
