import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import type { Refusal } from "./refusals";

/**
 * "Yang sengaja tidak kami tebak" — pembeda utama dari grup chat/formulir/spreadsheet, yang diam-diam
 * menjumlah, mengonversi, atau mengisi 0. Di sini setiap pengecualian terlihat, berhitung, dan beralasan.
 */
export function RefusalPanel({ refusals }: { refusals: Refusal[] }) {
  const total = refusals.reduce((n, r) => n + r.count, 0);
  return (
    <Panel
      id="refusals"
      title="Yang sengaja tidak kami tebak"
      description="Tidak dihitung sampai manusia memastikan. Angka di atas tidak memuat ini."
      actions={<Badge tone={total > 0 ? "warn" : "ok"} icon={total > 0 ? "warning" : "ok"}>{total > 0 ? `${total} butuh keputusan manusia` : "Tidak ada saat ini"}</Badge>}
    >
      <ul className="grid gap-3 lg:grid-cols-3">
        {refusals.map((r) => (
          <li key={r.kind} data-refusal={r.kind} className={`rounded-md border p-4 ${r.count > 0 ? "border-warn/40 bg-warn/5" : "border-navy-700 bg-white"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold">{r.title}</h3>
              <p className="font-mono text-2xl font-bold tabular-nums" aria-label={`${r.count} kasus`}>{r.count}</p>
            </div>
            <p className="mt-1 text-sm text-ink">{r.reason}</p>
            {r.count > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-navy-700 pt-2 text-xs text-muted">
                {r.examples.map((e) => <li key={e} className="font-mono">{e}</li>)}
                {r.more > 0 && <li>dan {r.more} lainnya</li>}
              </ul>
            ) : (
              <p className="mt-3 border-t border-navy-700 pt-2 text-xs text-subtle">Tidak ada kasus. Aturannya tetap berlaku.</p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
