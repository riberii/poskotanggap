import type { InventoryItem } from "@/lib/domain/types";
import { formatArea, formatDateTime, formatNumber } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { InfoTip } from "@/components/ui/InfoTip";
import { Table, Td, Th } from "@/components/ui/Table";
import { InventoryForm } from "./InventoryForm";

export function InventoryPanel({ inventory, onChanged }: { inventory: InventoryItem[]; onChanged?: () => void }) {
  return (
    <Panel id="inventory" title="Stok" description={<InfoTip>Stok per area, barang, dan satuan. Satuan berbeda dicatat terpisah, tidak dikonversi.</InfoTip>}>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          {inventory.length === 0 ? (
            <EmptyState icon="box" title="Belum ada stok" body="Catat stok di formulir." />
          ) : (
            <Table caption="Rekap stok per area">
              <thead>
                <tr>
                  <Th>Area</Th>
                  <Th>Barang</Th>
                  <Th>Satuan</Th>
                  <Th align="right">Tersedia</Th>
                  <Th>Diperbarui</Th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((i) => (
                  <tr key={i.id} className="hover:bg-navy-850/60">
                    <Td>{formatArea(i.area)}</Td>
                    <Td className="capitalize">{i.item}</Td>
                    <Td>{i.unit}</Td>
                    <Td align="right" mono>
                      {formatNumber(i.availableQuantity)}
                    </Td>
                    <Td mono className="whitespace-nowrap text-xs text-muted">
                      {formatDateTime(i.updatedAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <InventoryForm onSaved={onChanged} />
      </div>
    </Panel>
  );
}
