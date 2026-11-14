// Klien ke /api/sync (Netlify Database). Semua fungsi mengembalikan hasil, tidak melempar:
// jaringan putus dibedakan dari "tidak ditemukan" agar UI jujur.
import { authHeaders } from "@/lib/operator-token";
import type { ChatMessage, ChatSender, ChatThread } from "@/lib/domain/chat";
import type { GeoPoint } from "@/lib/domain/geo";
import type { Report } from "@/lib/domain/types";
import { reportCode } from "@/lib/domain/follow-up";
import type { RemoteStatusView } from "@/lib/server/sync-core";

/** Dikirim ke window saat server menjawab 401; OperatorGate menampilkan layar kode operator. */
export const UNAUTHORIZED_EVENT = "poskotanggap-unauthorized";

export type Remote<T> = { ok: true; data: T } | { ok: false; kind: "network" | "not_found" | "unauthorized" | "server"; message: string };

async function call<T>(path: string, init?: RequestInit): Promise<Remote<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/sync/${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() } });
  } catch {
    return { ok: false, kind: "network", message: "Tidak ada koneksi ke server." };
  }
  // Di server dev tanpa Netlify (npm run dev biasa) rute ini 404 tanpa JSON; perlakukan sebagai tidak tersedia.
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return { ok: false, kind: "network", message: "Layanan sinkron tidak tersedia di lingkungan ini." };
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (res.ok) return { ok: true, data: body as T };
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    return { ok: false, kind: "unauthorized", message: body?.error?.message ?? "Masukkan kode operator." };
  }
  return { ok: false, kind: res.status === 404 ? "not_found" : "server", message: body?.error?.message ?? "Server bermasalah." };
}

const MAX_BYTES = 4_500_000;

/** Kirim laporan ke posko. Jika terlalu besar, data lampiran dibuang (teks dan GPS tetap terkirim). */
export function pushReport(report: Report): Promise<Remote<{ code: string }>> {
  let body = JSON.stringify(report);
  if (body.length > MAX_BYTES) {
    body = JSON.stringify({ ...report, attachments: (report.attachments ?? []).map((a) => ({ ...a, dataUrl: null })) });
  }
  return call("reports", { method: "POST", body });
}

export function pushStatus(report: Report) {
  return call<{ ok: true }>(`reports/${report.id}`, {
    method: "PUT",
    body: JSON.stringify({
      status: report.status,
      duplicate: report.duplicateResolution === "confirmed_duplicate",
      followUp: report.status === "verified" ? (report.followUp ?? null) : null,
    }),
  });
}

export const fetchInbox = () => call<{ reports: unknown[] }>("reports");
export const fetchStatus = (code: string) => call<{ view: RemoteStatusView; geo: GeoPoint | null }>(`status/${encodeURIComponent(code)}`);
export const fetchMessages = (code: string, after = 0) => call<{ messages: ChatMessage[] }>(`messages/${encodeURIComponent(code)}?after=${after}`);
export const postMessage = (code: string, sender: ChatSender, body: string) =>
  call<{ message: ChatMessage }>(`messages/${encodeURIComponent(code)}`, { method: "POST", body: JSON.stringify({ sender, body }) });
export const fetchThreads = () => call<{ threads: ChatThread[] }>("threads");

// --- Antrean kirim ulang (pelapor offline / server sibuk) ---
const UNSYNCED_KEY = "poskotanggap:unsynced";
const readUnsynced = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(UNSYNCED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const writeUnsynced = (ids: string[]) => {
  try {
    localStorage.setItem(UNSYNCED_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // Tidak kritis.
  }
};
/** Penanda: "r:<id>" = laporan belum terkirim; "s:<id>" = perubahan status belum terkirim. */
export const markUnsynced = (id: string, kind: "r" | "s" = "r") => writeUnsynced([...readUnsynced(), `${kind}:${id}`]);
export const isUnsynced = (id: string) => readUnsynced().includes(`r:${id}`);

/** Kirim ulang yang tertunda. `load` membaca laporan dari penyimpanan lokal. Mengembalikan jumlah yang berhasil. */
export async function flushUnsynced(load: (id: string) => Promise<Report | null>): Promise<number> {
  const pending = readUnsynced();
  const still: string[] = [];
  let sent = 0;
  for (const mark of pending) {
    const [kind, id] = [mark.slice(0, 1), mark.slice(2)];
    const r = await load(id);
    if (!r) continue;
    const res = kind === "r" ? await pushReport(r) : await pushStatus(r);
    if (res.ok) sent++;
    else still.push(mark);
  }
  writeUnsynced(still);
  return sent;
}

/** Kirim laporan baru; bila status bukan "menunggu review" (operator menyimpan langsung), kirim status juga. */
export async function syncCreated(r: Report): Promise<boolean> {
  const res = await pushReport(r);
  if (!res.ok) {
    markUnsynced(r.id, "r");
    return false;
  }
  if (r.status !== "pending_review") return syncStatus(r);
  return true;
}

export async function syncStatus(r: Report): Promise<boolean> {
  const res = await pushStatus(r);
  // 404 = laporan ini tidak pernah dikirim ke server (mis. data demo awal): bukan kegagalan.
  if (res.ok || res.kind === "not_found") return true;
  markUnsynced(r.id, "s");
  return false;
}

export { reportCode };
