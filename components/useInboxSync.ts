import { useEffect } from "react";
import { getLocalBackend } from "@/components/DataModeProvider";
import { fetchInbox } from "@/lib/remote";
import { LOCAL_CHANGE_EVENT } from "@/lib/sync";

const POLL_MS = 15_000;

/** Perangkat tim: tarik laporan baru dari pelapor (server sinkron) ke antrean lokal. */
export function useInboxSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const pull = async () => {
      if (document.visibilityState === "hidden") return;
      const res = await fetchInbox();
      if (stop || !res.ok) return;
      const n = await getLocalBackend().importInbox(res.data.reports);
      if (n > 0) window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
    };
    void pull();
    const t = setInterval(() => void pull(), POLL_MS);
    document.addEventListener("visibilitychange", pull);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [enabled]);
}
