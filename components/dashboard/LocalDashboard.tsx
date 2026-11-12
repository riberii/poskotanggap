import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardSummary } from "@/lib/domain/aggregation";
import { useDataMode } from "@/components/DataModeProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icons";
import { AttentionPanel } from "./AttentionPanel";
import { buildAttention } from "./attention";
import { InventoryPanel } from "./InventoryPanel";
import { NeedsSummary } from "./NeedsSummary";
import { RecentReports } from "./RecentReports";
import { StatusCounts } from "./StatusCounts";
import { UnknownNeeds } from "./UnknownNeeds";

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Memuat dashboard" className="space-y-6">
      <div className="skeleton h-24" />
      <div className="skeleton h-64" />
      <div className="skeleton h-48" />
    </div>
  );
}

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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Situasi posko</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Ringkasan dari laporan yang sudah diverifikasi operator, dibandingkan dengan stok yang tercatat.
          </p>
        </div>
        <Link
          to="/intake"
          className="inline-flex items-center gap-2 rounded-md bg-teal-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-strong"
        >
          <Icon name="plus" size={16} />
          Laporan baru
        </Link>
      </div>

      {error ? (
        <EmptyState
          role="alert"
          tone="danger"
          icon="critical"
          title="Dashboard tidak dapat dimuat"
          body={<>{error} Data Anda tidak diubah. Muat ulang halaman, atau gunakan “Reset data” di bagian atas bila penyimpanan browser rusak.</>}
          action={<button type="button" onClick={load} className="font-semibold underline underline-offset-2">Coba muat lagi</button>}
        />
      ) : !summary ? (
        <DashboardSkeleton />
      ) : summary.totalReports === 0 ? (
        <div className="space-y-6">
          <EmptyState
            icon="doc"
            title="Belum ada laporan"
            body="Dashboard terisi setelah laporan pertama dimasukkan dan diverifikasi. Tempel pesan lapangan, periksa hasil ekstraksinya, lalu verifikasi."
            action={<Link to="/intake" className="font-semibold text-teal-accent underline underline-offset-2">Masukkan laporan pertama</Link>}
          />
          <InventoryPanel inventory={summary.inventory} onChanged={load} />
        </div>
      ) : (
        <div className="space-y-6">
          <AttentionPanel items={buildAttention(summary)} />
          <StatusCounts summary={summary} />
          <NeedsSummary shortages={summary.shortages} excluded={summary.needs.excluded} />
          <UnknownNeeds items={summary.needs.unresolved} />
          <InventoryPanel inventory={summary.inventory} onChanged={load} />
          <RecentReports reports={summary.recentReports} />
        </div>
      )}
    </>
  );
}
