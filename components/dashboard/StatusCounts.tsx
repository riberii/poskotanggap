import type { DashboardSummary } from "@/lib/domain/aggregation";
import { CountUp } from "@/components/ui/CountUp";
import { priorityOf } from "@/lib/domain/aggregation";

/** Satu baris angka kunci (bukan banyak kartu). */
export function StatusCounts({ summary }: { summary: DashboardSummary }) {
  const shortageCount = summary.shortages.filter((r) => priorityOf(r) === "critical").length;
  const unclear =
    summary.shortages.filter((r) => r.status === "unit_mismatch" || r.status === "no_stock_record").length +
    summary.needs.unresolved.length;
  const ITEMS = [
    { label: "Perlu diverifikasi", value: summary.counts.pendingReview, note: "belum masuk rekap", cls: summary.counts.pendingReview ? "text-warn" : "" },
    { label: "Barang kurang", value: shortageCount, note: "jenis barang, bukan unit", cls: shortageCount ? "text-danger" : "" },
    { label: "Belum jelas", value: unclear, note: "jumlah/satuan/stok", cls: unclear ? "text-warn" : "" },
  ];
  return (
    <section aria-label="Angka kunci">
      <dl className="grid divide-navy-700 overflow-hidden rounded-lg border border-navy-700 bg-white grid-cols-3 divide-x">
        {ITEMS.map((it) => (
          <div key={it.label} title={it.note} className="px-4 py-3.5">
            <dt className="text-xs font-semibold text-muted">{it.label}</dt>
            <dd className={`mt-1 text-3xl font-bold tabular-nums ${it.cls || "text-ink"}`}><CountUp id={it.label} value={it.value} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
