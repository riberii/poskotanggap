import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InventoryPanel } from "@/components/dashboard/InventoryPanel";
import { NeedsSummary } from "@/components/dashboard/NeedsSummary";
import { RecentReports } from "@/components/dashboard/RecentReports";
import { StatusCounts } from "@/components/dashboard/StatusCounts";
import { LocalDashboard } from "@/components/dashboard/LocalDashboard";
import { getDataMode, getRequestContext } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { ServiceError } from "@/lib/services/errors";
import { getDashboard } from "@/lib/services/reports";

export const metadata: Metadata = { title: "Situation Dashboard · POSKOTANGGAP" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (getDataMode() === "local") return <LocalDashboard />;
  let summary;
  try {
    const { repo } = await getRequestContext();
    summary = await getDashboard(repo);
  } catch (err) {
    if (err instanceof ServiceError && (err.status === 401 || err.status === 403)) redirect("/login");
    throw err;
  }
  const generatedAt = new Date().toISOString();

  return (
    <>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Situation Dashboard</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Rekap dihitung secara deterministik dari laporan terverifikasi saja. Muat ulang halaman untuk data terbaru.
          </p>
        </div>
        <p className="font-mono text-xs text-subtle">Dihitung: {formatDateTime(generatedAt)}</p>
      </div>
      <div className="space-y-6">
        <StatusCounts counts={summary.counts} />
        <NeedsSummary shortages={summary.shortages} excluded={summary.needs.excluded} />
        <InventoryPanel inventory={summary.inventory} />
        <RecentReports reports={summary.recentReports} />
      </div>
    </>
  );
}
