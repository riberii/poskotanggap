import { Link } from "react-router-dom";
import { EXCLUSION_LABELS, priorityOf, sortByPriority, type ExclusionReason, type ShortageRow } from "@/lib/domain/aggregation";
import { formatArea, formatNumber } from "@/lib/format";
import { Badge, PriorityBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";

function StockTable({ rows, caption }: { rows: ShortageRow[]; caption: string }) {
  return (
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
            </Td>
            <Td><PriorityBadge priority={priorityOf(r)} /></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function MismatchCard({ row }: { row: ShortageRow }) {
  return (
    <li className="rounded-md border border-warn/40 bg-warn/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warn" icon="unit">Satuan tidak cocok · Unit mismatch</Badge>
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
      <p className="mt-2 text-xs text-muted">
        Sistem tidak mengonversi satuan (isi 1 {row.otherStock[0]?.unit ?? "satuan"} tidak diketahui), sehingga kekurangan tidak dihitung.
      </p>
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
      description="Hanya jumlah “tambahan” dari laporan terverifikasi. Stok dicocokkan per area, barang, dan satuan yang sama persis."
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="box"
          title="Belum ada kebutuhan terverifikasi"
          body="Rekap terisi setelah operator memverifikasi laporan yang memuat kebutuhan dengan jumlah dan satuan jelas."
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
              <EmptyState icon="ok" tone="ok" title="Tidak ada kekurangan" body="Semua kebutuhan terverifikasi tercukupi oleh stok yang tercatat." />
            )
          )}

          {mismatch.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-warn"><Icon name="unit" />Perlu verifikasi: satuan berbeda ({mismatch.length})</h3>
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
                    <span className="text-xs text-muted">Kekurangan belum bisa dihitung (stok ≠ 0, hanya belum dicatat)</span>
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
          <summary className="cursor-pointer font-semibold text-muted">Mengapa sebagian kebutuhan tidak dihitung?</summary>
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
