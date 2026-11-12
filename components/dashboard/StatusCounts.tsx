import type { DashboardSummary } from "@/lib/domain/aggregation";
import { priorityOf } from "@/lib/domain/aggregation";

/** Satu baris angka kunci (bukan banyak kartu). */
export function StatusCounts({ summary }: { summary: DashboardSummary }) {
  const shortageCount = summary.shortages.filter((r) => priorityOf(r) === "critical").length;
  const unclear =
    summary.shortages.filter((r) => r.status === "unit_mismatch" || r.status === "no_stock_record").length +
    summary.needs.unresolved.length;
  const ITEMS = [
    { label: "Laporan masuk", value: summary.totalReports, note: "semua status, termasuk ditolak", cls: "" },
    { label: "Perlu diverifikasi", value: summary.counts.pendingReview, note: "belum masuk rekap", cls: summary.counts.pendingReview ? "text-warn" : "" },
    { label: "Potensi duplikat", value: summary.counts.potentialDuplicates, note: "perlu dibandingkan", cls: summary.counts.potentialDuplicates ? "text-dup" : "" },
    { label: "Barang kurang", value: shortageCount, note: "jenis barang per lokasi, bukan jumlah unit", cls: shortageCount ? "text-danger" : "" },
    { label: "Belum jelas", value: unclear, note: "jumlah / satuan / stok belum pasti", cls: unclear ? "text-warn" : "" },
    { label: "Terverifikasi", value: summary.counts.verified, note: "sudah dihitung di rekap", cls: "text-ok" },
  ];
  return (
    <section aria-label="Angka kunci">
      <dl className="grid grid-cols-2 divide-navy-700 overflow-hidden rounded-lg border border-navy-700 bg-white sm:grid-cols-3 lg:grid-cols-6 lg:divide-x [&>div]:border-b [&>div]:border-navy-700 lg:[&>div]:border-b-0">
        {ITEMS.map((it) => (
          <div key={it.label} className="px-4 py-3.5">
            <dt className="text-xs font-semibold text-muted">{it.label}</dt>
            <dd className={`mt-1 text-3xl font-bold tabular-nums ${it.cls || "text-ink"}`}>{it.value}</dd>
            <dd className="text-xs text-subtle">{it.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
