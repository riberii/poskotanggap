// Sinkron antar jendela/bingkai pada browser yang sama lewat BroadcastChannel.
// Data tetap hanya di localStorage; kanal ini cuma memberi tahu "ada perubahan, muat ulang".
// Event `storage` tetap didengarkan sebagai cadangan (BroadcastChannel tidak ada di semua browser lama).
import { useEffect, useRef } from "react";

export const SYNC_CHANNEL = "poskotanggap-sync";
/** Peristiwa di tab yang sama (BroadcastChannel tidak mengirim ke pengirimnya sendiri). */
export const LOCAL_CHANGE_EVENT = "poskotanggap-local-change";

/** Beri tahu jendela lain bahwa data berubah. Gagal diam-diam bila BroadcastChannel tidak tersedia. */
export function notifyDataChanged(): void {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    ch.postMessage({ type: "data-changed", at: Date.now() });
    ch.close();
  } catch {
    // Tidak kritis: jendela lain akan memuat ulang pada operasi berikutnya.
  }
}

/** Panggil `cb` setiap kali jendela lain mengubah data. */
export function useDataChanged(cb: () => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const fire = () => ref.current();
    window.addEventListener("storage", fire);
    window.addEventListener(LOCAL_CHANGE_EVENT, fire);
    let ch: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        ch = new BroadcastChannel(SYNC_CHANNEL);
        ch.onmessage = fire;
      }
    } catch {
      ch = null;
    }
    return () => {
      window.removeEventListener("storage", fire);
      window.removeEventListener(LOCAL_CHANGE_EVENT, fire);
      ch?.close();
    };
  }, []);
}
