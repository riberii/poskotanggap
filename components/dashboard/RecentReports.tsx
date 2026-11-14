import { useRef } from "react";
import { Link } from "react-router-dom";
import { INCIDENT_LABELS, type Report } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";

export function RecentReports({ reports }: { reports: Report[] }) {
  // Laporan yang muncul setelah render pertama = baru masuk: geser masuk + sorot kuning + lencana BARU.
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (seen.current) for (const r of reports) if (!seen.current.has(r.id)) fresh.add(r.id);
  const known = seen.current ?? new Set<string>();
  for (const r of reports) known.add(r.id);
  seen.current = known;
  const newBadge = (id: string) => (fresh.has(id) ? <Badge tone="accent">Baru</Badge> : null);
  return (
    <Panel id="recent" title="Laporan terbaru" description="10 terakhir">
      {reports.length === 0 ? (
        <EmptyState icon="doc" title="Belum ada laporan" body="Muncul di sini." action={<Link to="/intake" className="font-semibold text-teal-accent underline underline-offset-2">Masukkan laporan pertama</Link>} />
      ) : (
        <>
        {/* Ponsel: kartu per laporan */}
        <ul aria-label="Daftar laporan insiden terbaru" className="divide-y divide-navy-700 rounded-md border border-navy-700 sm:hidden">
          {reports.map((r) => (
            <li key={r.id} className={`space-y-1.5 px-3 py-3 text-sm ${fresh.has(r.id) ? "row-new flash" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                {newBadge(r.id)}
                <StatusBadge status={r.status} resolution={r.duplicateResolution} />
                {r.duplicateOf && r.status === "pending_review" && <Badge tone="dup" icon="duplicate">Potensi duplikat</Badge>}
              </div>
              <p className="font-semibold">{r.incidentType ? INCIDENT_LABELS[r.incidentType] : "Jenis belum diisi"} · {r.locationText ?? <em className="font-normal text-warn">lokasi tidak diketahui</em>}</p>
              <p className="line-clamp-2 text-xs text-muted">{r.rawText}</p>
              <p className="text-xs text-subtle">{formatDateTime(r.submittedAt)} · {r.needs.length} kebutuhan{(r.attachments?.length ?? 0) > 0 ? ` · ${r.attachments!.length} lampiran` : ""}</p>
              {r.status === "pending_review" && (
                <Link to={`/intake?report=${r.id}`} className="inline-flex min-h-11 items-center font-semibold text-teal-accent underline underline-offset-2">Periksa & verifikasi</Link>
              )}
            </li>
          ))}
        </ul>
        <div className="hidden sm:block">
        <Table caption="Daftar laporan insiden terbaru">
          <thead>
            <tr>
              <Th>Waktu masuk</Th>
              <Th>Jenis</Th>
              <Th>Lokasi</Th>
              <Th>Status</Th>
              <Th align="right">Kebutuhan</Th>
              <Th>Tindakan</Th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className={`hover:bg-navy-850/60 ${fresh.has(r.id) ? "row-new flash" : ""}`}>
                <Td mono className="whitespace-nowrap text-xs text-muted">
                  {formatDateTime(r.submittedAt)}
                </Td>
                <Td>{r.incidentType ? INCIDENT_LABELS[r.incidentType] : <em className="text-subtle">belum diisi</em>}</Td>
                <Td>
                  {r.locationText ?? <em className="text-warn">lokasi tidak diketahui</em>}
                  <span className="mt-0.5 block max-w-xs truncate text-xs text-subtle" title={r.rawText}>
                    {r.rawText}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    {newBadge(r.id)}
                    <StatusBadge status={r.status} resolution={r.duplicateResolution} />
                    {r.duplicateOf && r.status === "pending_review" && <Badge tone="dup" icon="duplicate">Potensi duplikat</Badge>}
                  </div>
                </Td>
                <Td align="right" mono>
                  {r.needs.length}
                </Td>
                <Td>
                  {r.status === "pending_review" ? (
                    <Link
                      to={`/intake?report=${r.id}`}
                      className="text-sm font-semibold text-teal-accent underline underline-offset-2"
                    >
                      Periksa
                    </Link>
                  ) : r.status === "verified" ? (
                    <Link to={`/intake?report=${r.id}`} className="text-sm font-semibold text-teal-accent underline underline-offset-2">
                      {r.followUp ? "Diatur ✓" : "Atur bantuan"}
                    </Link>
                  ) : (
                    <span className="text-xs text-subtle">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        </div>
        </>
      )}
    </Panel>
  );
}
