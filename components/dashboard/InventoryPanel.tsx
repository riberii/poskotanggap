import type { InventoryItem } from "@/lib/domain/types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { InventoryForm } from "./InventoryForm";

export function InventoryPanel({ inventory }: { inventory: InventoryItem[] }) {
  return (
    <Panel id="inventory" title="Rekap stok" description="Stok tercatat per area, barang, dan satuan. Nilai tidak boleh negatif.">
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          {inventory.length === 0 ? (
            <p className="text-sm text-subtle">Belum ada data stok.</p>
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
                    <Td className="capitalize">{i.area}</Td>
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
        <InventoryForm />
      </div>
    </Panel>
  );
}
