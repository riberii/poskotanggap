import { Link } from "react-router-dom";
import { EXCLUSION_LABELS, priorityOf, sortByPriority, type ExclusionReason, type ShortageRow } from "@/lib/domain/aggregation";
import { formatArea, formatNumber } from "@/lib/format";
import { Badge, PriorityBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { InfoTip } from "@/components/ui/InfoTip";

/** Batang kekurangan: hijau = stok, merah = kekurangan; segmen merah tumbuh (transform) dari stok ke kebutuhan. */
function ShortageBar({ r }: { r: ShortageRow }) {
  if (!r.shortage || !r.requested) return null;
  const pct = Math.min(100, Math.max(0, ((r.available ?? 0) / r.requested) * 100));
  return (
    <div role="img" aria-label={`Stok ${Math.round(pct)}% dari kebutuhan`} className="relative mt-1 h-1.5 w-full min-w-16 overflow-hidden rounded bg-navy-800">
      <div className="absolute inset-y-0 left-0 bg-ok" style={{ width: `${pct}%` }} />
      <div key={`${r.available ?? 0}-${r.requested}`} className="short-bar absolute inset-y-0 right-0 bg-danger" style={{ left: `${pct}%` }} />
    </div>
  );
}

function StockTable({ rows, caption }: { rows: ShortageRow[]; caption: string }) {
  return (
    <>
    {/* Ponsel: satu kartu per barang, tanpa geser samping */}
    <ul aria-label={caption} className="divide-y divide-navy-700 rounded-md border border-navy-700 sm:hidden">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1 px-3 py-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p><span className="font-semibold capitalize">{r.item}</span> <span className="text-muted">— {formatArea(r.area)}</span></p>
            <PriorityBadge priority={priorityOf(r)} />
          </div>
          <p className="font-mono text-xs tabular-nums text-muted">
            {formatNumber(r.requested)} dibutuhkan · {formatNumber(r.available)} tersedia ·{" "}
            <span className={r.shortage ? "font-bold text-danger" : ""}>{formatNumber(r.shortage ?? 0)} kurang</span> ({r.unit})
          </p>
          <ShortageBar r={r} />
        </li>
      ))}
    </ul>
    <div className="hidden sm:block">
    <Table caption={caption}>
      <thead>
        <tr>
          <Th>Area</Th>
          <Th>Barang</Th>
          <Th align="right">Dibutuhkan</Th>
          <Th align="right">Tersedia</Th>
          <Th align="right">Kurang</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <Td>{formatArea(r.area)}</Td>
            <Td className="capitalize">
              <span className="font-semibold">{r.item}</span>
              <span className="block text-xs normal-case text-subtle">{r.reportCount} laporan terverifikasi</span>
            </Td>
            <Td align="right" mono>{formatNumber(r.requested)} {r.unit}</Td>
            <Td align="right" mono>{formatNumber(r.available)} {r.unit}</Td>
            <Td align="right" mono className={r.shortage ? "font-bold text-danger" : ""}>
              {r.shortage ? `${formatNumber(r.shortage)} ${r.unit}` : "0"}
              <ShortageBar r={r} />
            </Td>
            <Td><PriorityBadge priority={priorityOf(r)} /></Td>
          </tr>
        ))}
      </tbody>
    </Table>
    </div>
    </>
  );
}

function MismatchCard({ row }: { row: ShortageRow }) {
  return (
    <li className="rounded-md border border-warn/40 bg-warn/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warn" icon="unit">Satuan tidak cocok</Badge>
        <span className="text-sm font-semibold capitalize">{row.item}</span>
        <span className="text-sm text-muted">— {formatArea(row.area)}</span>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-navy-700 bg-white px-3 py-2">
          <dt className="text-xs font-semibold text-muted">Dibutuhkan</dt>
          <dd className="font-mono text-lg font-bold tabular-nums">{formatNumber(row.requested)} {row.unit}</dd>
        </div>
        <div className="rounded border border-navy-700 bg-white px-3 py-2">
          <dt className="text-xs font-semibold text-muted">Tersedia (satuan berbeda)</dt>
          <dd className="font-mono text-lg font-bold tabular-nums">
            {row.otherStock.map((o) => `${formatNumber(o.quantity)} ${o.unit}`).join(" + ")}
          </dd>
        </div>
        <div className="rounded border border-warn/40 bg-white px-3 py-2">
          <dt className="text-xs font-semibold text-muted">Tindakan</dt>
          <dd className="text-sm font-semibold text-warn">Perlu verifikasi manusia</dd>
        </div>
      </dl>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer font-semibold">Mengapa?</summary>
        <p className="mt-1">Satuan tidak dikonversi (isi 1 {row.otherStock[0]?.unit ?? "satuan"} tidak diketahui), jadi kekurangan tidak dihitung.</p>
      </details>
    </li>
  );
}

export function NeedsSummary({
  shortages,
  excluded,
}: {
  shortages: ShortageRow[];
  excluded: Record<ExclusionReason, number>;
}) {
  const rows = sortByPriority(shortages);
  const critical = rows.filter((r) => priorityOf(r) === "critical");
  const mismatch = rows.filter((r) => r.status === "unit_mismatch");
  const noStock = rows.filter((r) => r.status === "no_stock_record");
  const fine = rows.filter((r) => priorityOf(r) === "ok");
  const excludedEntries = (Object.entries(excluded) as Array<[ExclusionReason, number]>).filter(([, n]) => n > 0);

  return (
    <Panel
      id="needs"
      title="Kebutuhan vs stok"
      description={<InfoTip>Hanya jumlah “tambahan” dari laporan terverifikasi. Stok dicocokkan per area, barang, dan satuan yang sama persis.</InfoTip>}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="box"
          title="Belum ada kebutuhan"
          body="Terisi setelah verifikasi."
          action={<Link to="/intake" className="font-semibold text-teal-accent underline underline-offset-2">Buka laporan masuk</Link>}
        />
      ) : (
        <div className="space-y-6">
          {critical.length > 0 ? (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-danger"><Icon name="critical" />Kekurangan ({critical.length})</h3>
              <StockTable rows={critical} caption="Kebutuhan yang belum terpenuhi" />
            </div>
          ) : (
            mismatch.length === 0 && noStock.length === 0 && (
              <EmptyState icon="ok" tone="ok" title="Tidak ada kekurangan" body="Semua tercukupi." />
            )
          )}

          {mismatch.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-warn"><Icon name="unit" />Satuan berbeda ({mismatch.length})</h3>
              <ul className="space-y-3">{mismatch.map((r) => <MismatchCard key={r.key} row={r} />)}</ul>
            </div>
          )}

          {noStock.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-warn"><Icon name="warning" />Stok belum tercatat ({noStock.length})</h3>
              <ul className="divide-y divide-navy-700 rounded-md border border-navy-700">
                {noStock.map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span><span className="font-semibold capitalize">{r.item}</span> · {formatArea(r.area)} · dibutuhkan <span className="font-mono">{formatNumber(r.requested)} {r.unit}</span></span>
                    <span className="text-xs text-muted">Stok belum dicatat</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fine.length > 0 && (
            <details className="rounded-md border border-navy-700">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-ok">Tercukupi ({fine.length})</summary>
              <div className="border-t border-navy-700 pt-2"><StockTable rows={fine} caption="Kebutuhan yang tercukupi" /></div>
            </details>
          )}
        </div>
      )}

      {excludedEntries.length > 0 && (
        <details className="mt-5 rounded-md border border-navy-700 bg-navy-850 px-4 py-2.5 text-xs">
          <summary className="cursor-pointer font-semibold text-muted">Tidak dihitung</summary>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-subtle sm:grid-cols-2">
            {excludedEntries.map(([reason, n]) => (
              <li key={reason}>{EXCLUSION_LABELS[reason]}: <span className="font-mono font-bold text-ink">{n}</span></li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
