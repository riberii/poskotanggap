import { INCIDENT_LABELS, type IncidentType, type Report } from "@/lib/domain/types";
import type { DuplicateComparison } from "@/lib/domain/duplicates";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";

interface Side {
  title: string;
  status?: Report["status"];
  time?: string | null;
  incident: IncidentType | "" | null;
  location: string | null;
  text: string;
  needs: Array<{ item: string; quantity: number | null; unit: string | null }>;
}

function Column({ side }: { side: Side }) {
  return (
    <div className="min-w-0 rounded-md border border-navy-700 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{side.title}</p>
        {side.status && <StatusBadge status={side.status} />}
      </div>
      <p className="text-sm font-semibold">
        {side.incident ? INCIDENT_LABELS[side.incident] : "Jenis belum diisi"} · {side.location || "Lokasi belum diisi"}
      </p>
      {side.time && <p className="text-xs text-subtle">{formatDateTime(side.time)}</p>}
      <p className="mt-2 max-h-28 overflow-auto rounded bg-navy-850 p-2 text-xs leading-relaxed text-muted">{side.text}</p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {side.needs.length === 0 && <li className="text-subtle">Tanpa kebutuhan barang</li>}
        {side.needs.map((n, i) => (
          <li key={i} className="capitalize">
            {n.item}: {n.quantity === null ? <span className="font-bold text-warn">jumlah tidak diketahui</span> : <span className="font-mono">{formatNumber(n.quantity)} {n.unit ?? ""}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** POTENTIAL DUPLICATE: Laporan A vs Laporan B + alasan + tiga keputusan operator. Tidak ada yang dihapus otomatis. */
export function DuplicateCompare({
  current,
  other,
  comparison,
  busy,
  verifyBlockedReason,
  onConfirm,
  onKeepBoth,
  onLater,
}: {
  current: Side;
  other: Side;
  comparison: DuplicateComparison;
  busy: boolean;
  verifyBlockedReason: string | null;
  onConfirm: () => void;
  onKeepBoth: () => void;
  onLater: () => void;
}) {
  return (
    <section aria-labelledby="dup-title" className="rounded-lg border-2 border-dup/50 bg-dup/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="dup" icon="duplicate">Potensi duplikat</Badge>
        <h3 id="dup-title" className="text-base font-bold">Laporan ini mirip laporan lain</h3>
      </div>
      <p className="mt-1 text-sm text-muted">Sistem hanya menandai. Tidak ada laporan yang dihapus atau digabung otomatis — Anda yang memutuskan.</p>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Mengapa dianggap mirip</p>
        <ul className="space-y-1 text-sm">
          {comparison.reasons.map((r) => (
            <li key={r} className="flex items-start gap-2"><Icon name="ok" size={14} className="mt-1 text-dup" />{r}</li>
          ))}
        </ul>
        {comparison.sharedItems.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            {comparison.sharedItems.map((s) => (
              <li key={s.item} className="capitalize">
                {s.item}: A {s.a} · B {s.b} {s.differs ? <strong className="text-warn">(berbeda)</strong> : <span>(sama)</span>}
              </li>
            ))}
          </ul>
        )}
        {comparison.notes.map((n) => (
          <p key={n} className="mt-2 flex items-start gap-2 text-sm text-warn"><Icon name="warning" size={14} className="mt-1" />{n}</p>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <Column side={current} />
        <div className="grid place-items-center text-xs font-bold text-dup" aria-hidden="true">VS</div>
        <Column side={other} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-navy-700 bg-white p-3">
          <Button variant="danger" className="w-full" disabled={busy} onClick={onConfirm}>Konfirmasi duplikat</Button>
          <p className="mt-1.5 text-xs text-muted">Laporan A disimpan sebagai ditolak. Tidak dihitung, tidak dihapus.</p>
        </div>
        <div className="rounded-md border border-navy-700 bg-white p-3">
          <Button variant="primary" className="w-full" disabled={busy || !!verifyBlockedReason} onClick={onKeepBoth}>Pertahankan keduanya</Button>
          <p className="mt-1.5 text-xs text-muted">{verifyBlockedReason ?? "Laporan A diverifikasi dan dihitung bersama B (bukan duplikat)."}</p>
        </div>
        <div className="rounded-md border border-navy-700 bg-white p-3">
          <Button className="w-full" disabled={busy} onClick={onLater}>Tinjau nanti</Button>
          <p className="mt-1.5 text-xs text-muted">Simpan sebagai menunggu verifikasi. Belum dihitung.</p>
        </div>
      </div>
    </section>
  );
}
