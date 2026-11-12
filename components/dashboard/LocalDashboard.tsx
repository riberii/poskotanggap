import { useCallback, useEffect, useState } from "react";
import type { DashboardSummary } from "@/lib/domain/aggregation";
import { useDataMode } from "@/components/DataModeProvider";
import { InventoryPanel } from "./InventoryPanel";
import { NeedsSummary } from "./NeedsSummary";
import { RecentReports } from "./RecentReports";
import { StatusCounts } from "./StatusCounts";

/** Dashboard mode prototipe: dihitung di browser dari data localStorage. */
export function LocalDashboard() {
  const { api } = useDataMode();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.dashboard().then((r) => {
      if (r.ok) {
        setSummary(r.data);
        setError(null);
      } else setError(r.error.message);
    });
  }, [api]);
  useEffect(load, [load]);
  return (
    <>
      <div className="mb-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-teal-accent">Ruang kerja posko <span className="mx-2 text-navy-600">/</span> Ringkasan</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Situasi sekilas.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Pantau laporan, kebutuhan, dan stok. Hanya kebutuhan tambahan yang telah diverifikasi masuk ke rekap.</p>
      </div>
      {error ? (
        <div role="alert" className="space-y-2 text-sm text-danger"><p>{error}</p><button type="button" onClick={load} className="font-medium underline underline-offset-2">Coba muat lagi</button></div>
      ) : !summary ? (
        <p className="text-sm text-subtle">Memuat rekap…</p>
      ) : (
        <div className="space-y-6">
          <StatusCounts counts={summary.counts} />
          <NeedsSummary shortages={summary.shortages} excluded={summary.needs.excluded} />
          <InventoryPanel inventory={summary.inventory} onChanged={load} />
          <RecentReports reports={summary.recentReports} />
        </div>
      )}
    </>
  );
}
