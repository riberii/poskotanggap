import { EXCLUSION_LABELS, type UnresolvedNeed } from "@/lib/domain/aggregation";
import { formatArea, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";

/** Kebutuhan terverifikasi yang jumlahnya tidak diketahui / bukan tambahan. Tidak pernah ditampilkan sebagai 0. */
export function UnknownNeeds({ items }: { items: UnresolvedNeed[] }) {
  if (items.length === 0) return null;
  return (
    <Panel
      id="unknown"
      title="Kebutuhan tanpa jumlah pasti"
      description="Barang sudah dilaporkan dan diverifikasi, tetapi jumlahnya belum diketahui. Sistem tidak menebak angka."
    >
      <ul className="divide-y divide-navy-700 rounded-md border border-navy-700">
        {items.map((u, i) => (
          <li key={`${u.reportId}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold capitalize">{u.item}</p>
              <p className="text-xs text-muted">{u.area ? formatArea(u.area) : "Lokasi tidak diketahui"} · {u.quantity === null ? "Jumlah belum diketahui" : EXCLUSION_LABELS[u.reason]}</p>
            </div>
            <div className="flex items-center gap-2">
              {u.quantity === null ? (
                <Badge tone="warn" icon="unknown">Jumlah: tidak diketahui</Badge>
              ) : (
                <span className="font-mono text-sm">{formatNumber(u.quantity)} {u.unit ?? ""}</span>
              )}
              {u.unit === null && <Badge tone="neutral" icon="unknown">Satuan: tidak diketahui</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
