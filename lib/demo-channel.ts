// Kanal KHUSUS halaman /demo (alat bantu presentasi, bukan fitur produk).
// Halaman /demo mengirim perintah ke dua bingkai (pelapor & operator) yang menjalankan KOMPONEN ASLI;
// bingkai hanya menerima perintah bila URL-nya memuat ?demo=1 sehingga pengguna biasa tidak terpengaruh.
import { useEffect, useRef } from "react";

export const DEMO_CHANNEL = "poskotanggap-demo";

export type DemoMsg =
  | { type: "reporter-run"; text: string; location: string }
  | { type: "reporter-done"; code: string; aiOk: boolean; aiNote: string | null }
  | { type: "reporter-error"; message: string }
  | { type: "operator-loaded"; id: string }
  | { type: "operator-verify" }
  | { type: "operator-verified"; id: string }
  | { type: "operator-arrange"; note: string }
  | { type: "operator-arranged"; id: string }
  | { type: "operator-error"; message: string };

export const isDemoFrame = (): boolean =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";

export function sendDemo(msg: DemoMsg): void {
  try {
    const ch = new BroadcastChannel(DEMO_CHANNEL);
    ch.postMessage(msg);
    ch.close();
  } catch {
    // BroadcastChannel tidak tersedia: /demo akan menampilkan kegagalan lewat batas waktu.
  }
}

/** Dengarkan pesan demo. Tidak aktif di luar bingkai ?demo=1 kecuali `always` (dipakai halaman /demo). */
export function useDemoMessages(handler: (m: DemoMsg) => void, always = false): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!always && !isDemoFrame()) return;
    const ch = new BroadcastChannel(DEMO_CHANNEL);
    ch.onmessage = (e: MessageEvent<DemoMsg>) => ref.current(e.data);
    return () => ch.close();
  }, [always]);
}
