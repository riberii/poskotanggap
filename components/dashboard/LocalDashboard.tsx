"use client";

import { useEffect, useState } from "react";
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
  useEffect(() => {
    api.dashboard().then((r) => (r.ok ? setSummary(r.data) : setError(r.error.message)));
  }, [api]);
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Situation Dashboard</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Rekap dihitung secara deterministik dari laporan terverifikasi yang tersimpan di browser ini.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">{error}</p>
      ) : !summary ? (
        <p className="text-sm text-subtle">Memuat rekap…</p>
      ) : (
        <div className="space-y-6">
          <StatusCounts counts={summary.counts} />
          <NeedsSummary shortages={summary.shortages} excluded={summary.needs.excluded} />
          <InventoryPanel inventory={summary.inventory} />
          <RecentReports reports={summary.recentReports} />
        </div>
      )}
    </>
  );
}
