import { useCallback, useEffect, useState } from "react";
import { useDataChanged } from "@/lib/sync";
import { useDataMode } from "@/components/DataModeProvider";
import { Icon } from "@/components/ui/icons";
import { FOLLOW_UP_STAGES } from "@/lib/domain/follow-up";
import type { ReportStatusView } from "@/lib/services/reports";

const COPY = {
  received: ["Laporan diterima.", "Posko sedang memeriksa."],
  verified: ["Laporan terverifikasi.", "Kebutuhan Anda masuk daftar prioritas."],
  arranged: ["Bantuan sedang diatur.", "Mohon bersabar."],
} as const;
const LABEL = ["Diterima", "Terverifikasi", "Diatur"];

/** Status laporan untuk pelapor. Sinkron lewat event `storage` (tab lain, perangkat yang sama). */
export function StatusTracker({ code }: { code: string }) {
  const { api } = useDataMode();
  const [view, setView] = useState<ReportStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api.getReportStatus(code);
    if (r.ok) { setView(r.data); setError(null); } else setError(r.error.message);
  }, [api, code]);
  useEffect(() => {
    void load();
  }, [load]);
  useDataChanged(() => void load());

  if (error) return <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>;
  if (!view) return <div role="status" aria-label="Memuat status" className="skeleton h-24" />;
  if (view.stage === "closed") {
    return <p aria-live="polite" className="rounded-md border border-navy-700 bg-navy-850 px-4 py-3 text-base font-semibold">Laporan serupa sudah tercatat. Tidak perlu kirim ulang.</p>;
  }
  const idx = FOLLOW_UP_STAGES.indexOf(view.stage);
  const [head, sub] = COPY[view.stage];
  return (
    <div>
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
