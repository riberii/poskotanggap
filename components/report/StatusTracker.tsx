import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChanged } from "@/lib/sync";
import { getLocalBackend, useDataMode } from "@/components/DataModeProvider";
import type { GeoPoint } from "@/lib/domain/geo";
import { fetchStatus, flushUnsynced } from "@/lib/remote";
import { Icon } from "@/components/ui/icons";
import { FOLLOW_UP_STAGES } from "@/lib/domain/follow-up";
import type { ReportStatusView } from "@/lib/services/reports";

const COPY = {
  received: ["Laporan diterima.", "Posko sedang memeriksa."],
  verified: ["Laporan terverifikasi.", "Kebutuhan Anda masuk daftar prioritas."],
  arranged: ["Bantuan sedang diatur.", "Mohon bersabar."],
} as const;
const LABEL = ["Diterima", "Terverifikasi", "Diatur"];

export type StatusSource = "server" | "local-unsynced" | "local-offline";

const POLL_MS = 10_000;

/**
 * Status laporan untuk pelapor lewat kode. Sumber utama: server (bisa dibuka dari perangkat mana pun).
 * Bila server tidak terjangkau / laporan belum terkirim, jatuh ke data di perangkat ini dan SELALU diberi tahu.
 */
export function StatusTracker({ code, onLoaded }: { code: string; onLoaded?: (info: { source: StatusSource; geo: GeoPoint | null }) => void }) {
  const { api } = useDataMode();
  const [view, setView] = useState<ReportStatusView | null>(null);
  const [source, setSource] = useState<StatusSource>("server");
  const [error, setError] = useState<string | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const load = useCallback(async () => {
    const remote = await fetchStatus(code);
    if (remote.ok) {
      setView(remote.data.view);
      setSource("server");
      setError(null);
      onLoadedRef.current?.({ source: "server", geo: remote.data.geo });
      return;
    }
    const local = await api.getReportStatus(code);
    if (local.ok) {
      const src = remote.kind === "not_found" ? "local-unsynced" : "local-offline";
      setView(local.data);
      setSource(src);
      setError(null);
      onLoadedRef.current?.({ source: src, geo: null });
    } else {
      setError(remote.kind === "not_found" ? "Kode laporan tidak ditemukan. Periksa kembali kodenya." : remote.message);
    }
  }, [api, code]);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  useDataChanged(() => void load());

  async function retry() {
    await flushUnsynced((id) => getLocalBackend().repo.getReport(id));
    await load();
  }

  if (error) return <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>;
  if (!view) return <div role="status" aria-label="Memuat status" className="skeleton h-24" />;
  if (view.stage === "closed") {
    return <p aria-live="polite" className="rounded-md border border-navy-700 bg-navy-850 px-4 py-3 text-base font-semibold">Laporan serupa sudah tercatat. Tidak perlu kirim ulang.</p>;
  }
  const idx = FOLLOW_UP_STAGES.indexOf(view.stage);
  const [head, sub] = COPY[view.stage];
  return (
    <div>
      {source !== "server" && (
        <p role="note" className="mb-3 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-ink">
          {source === "local-unsynced" ? "Laporan ini belum sampai ke posko." : "Server tidak terjangkau; ini data di perangkat ini dan bisa belum terbaru."}{" "}
          <button type="button" onClick={() => void retry()} className="min-h-9 font-semibold underline underline-offset-2">Kirim ulang / cek lagi</button>
        </p>
      )}
      <ol aria-label="Tahap laporan" className="grid grid-cols-3 gap-2">
        {LABEL.map((l, i) => (
          <li key={l} aria-current={i === idx ? "step" : undefined} className="text-center text-xs font-semibold">
            <div className="h-2 overflow-hidden rounded bg-navy-800">
              <div className="step-fill h-full bg-ok" style={{ transform: `scaleX(${i <= idx ? 1 : 0})` }} />
            </div>
            <span className={`mt-1 block ${i <= idx ? "text-ok" : "text-subtle"}`}>{i <= idx && <Icon name="ok" size={12} className="mr-0.5 inline" />}{l}</span>
          </li>
        ))}
      </ol>
      <div aria-live="polite" className="mt-3 text-center">
        <p className="text-lg font-bold">{head}</p>
        <p className="text-base text-muted">{sub}</p>
        {view.stage === "arranged" && view.note && <p className="mt-2 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-base font-semibold">{view.note}</p>}
      </div>
    </div>
  );
}
