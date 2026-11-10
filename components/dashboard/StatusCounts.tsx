import type { DashboardSummary } from "@/lib/domain/aggregation";

const ITEMS: Array<{ key: keyof DashboardSummary["counts"]; label: string; note: string; tone: string }> = [
  { key: "verified", label: "Insiden terverifikasi", note: "Dihitung dalam rekap", tone: "border-l-ok" },
  { key: "pendingReview", label: "Menunggu review", note: "Belum dihitung", tone: "border-l-warn" },
  { key: "potentialDuplicates", label: "Potensi duplikat", note: "Perlu keputusan manusia", tone: "border-l-dup" },
  { key: "rejected", label: "Ditolak", note: "Disimpan, tidak dihitung", tone: "border-l-navy-600" },
];

export function StatusCounts({ counts }: { counts: DashboardSummary["counts"] }) {
  return (
    <section aria-label="Status laporan">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ITEMS.map((it) => (
          <div key={it.key} className={`rounded-md border border-navy-700 border-l-4 bg-navy-900 px-4 py-3 ${it.tone}`}>
            <dt className="text-xs font-medium text-muted">{it.label}</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold text-ink">{counts[it.key]}</span>
              <span className="text-xs text-subtle">laporan</span>
            </dd>
            <dd className="mt-0.5 text-xs text-subtle">{it.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
