import { EXCLUSION_LABELS, type ExclusionReason, type ShortageRow } from "@/lib/domain/aggregation";
import { formatArea, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";

function StatusCell({ row }: { row: ShortageRow }) {
  switch (row.status) {
    case "shortage":
      return <Badge tone="danger">Kurang</Badge>;
    case "sufficient":
      return <Badge tone="ok">Cukup</Badge>;
    case "no_stock_record":
      return <Badge tone="warn">Tidak ada data stok</Badge>;
    case "unit_mismatch":
      return <Badge tone="dup">Satuan berbeda</Badge>;
  }
}

export function NeedsSummary({
  shortages,
  excluded,
}: {
  shortages: ShortageRow[];
  excluded: Record<ExclusionReason, number>;
}) {
  const excludedEntries = (Object.entries(excluded) as Array<[ExclusionReason, number]>).filter(([, n]) => n > 0);
  return (
    <Panel
      id="needs"
      title="Rekap kebutuhan vs stok"
      description="Hanya jumlah tambahan yang terverifikasi. Stok dicocokkan berdasarkan area, barang, dan satuan. Kekurangan belum dapat dihitung jika stok belum tercatat."
    >
      {shortages.length === 0 ? (
        <p className="text-sm text-subtle">Belum ada kebutuhan terverifikasi yang dapat dihitung.</p>
      ) : (
        <Table caption="Rekap kebutuhan dan kekurangan stok">
          <thead>
            <tr>
              <Th>Area</Th>
              <Th>Barang</Th>
              <Th>Satuan</Th>
              <Th align="right">Kebutuhan</Th>
              <Th align="right">Stok</Th>
              <Th align="right">Kekurangan</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {shortages.map((r) => (
              <tr key={r.key} className="hover:bg-navy-850/60">
                <Td>{formatArea(r.area)}</Td>
                <Td className="capitalize">
                  {r.item}
                  <span className="block text-xs normal-case text-subtle">{r.reportCount} laporan</span>
                </Td>
                <Td>{r.unit}</Td>
                <Td align="right" mono>
                  {formatNumber(r.requested)}
                </Td>
                <Td align="right" mono>
                  {formatNumber(r.available)}
                </Td>
                <Td align="right" mono className={r.shortage ? "font-semibold text-danger" : ""}>
                  {formatNumber(r.shortage)}
                </Td>
                <Td>
                  <StatusCell row={r} />
                  {r.status === "unit_mismatch" && (
                    <span className="mt-1 block text-xs text-subtle">Stok tercatat dalam: {r.otherStockUnits.join(", ")}</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {excludedEntries.length > 0 && (
        <div className="mt-4 rounded-md border border-navy-700 bg-navy-850 px-3 py-2.5 text-xs">
          <p className="font-medium text-muted">Item kebutuhan yang tidak dihitung:</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-subtle">
            {excludedEntries.map(([reason, n]) => (
              <li key={reason}>
                {EXCLUSION_LABELS[reason]}: <span className="font-mono text-ink">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
