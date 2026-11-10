import Link from "next/link";
import { INCIDENT_LABELS, type Report } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";

export function RecentReports({ reports }: { reports: Report[] }) {
  return (
    <Panel id="recent" title="Insiden terbaru" description="10 laporan terakhir berdasarkan waktu masuk, semua status.">
      {reports.length === 0 ? (
        <p className="text-sm text-subtle">Belum ada laporan.</p>
      ) : (
        <Table caption="Daftar laporan insiden terbaru">
          <thead>
            <tr>
              <Th>Waktu masuk</Th>
              <Th>Jenis</Th>
              <Th>Lokasi</Th>
              <Th>Status</Th>
              <Th align="right">Kebutuhan</Th>
              <Th>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="hover:bg-navy-850/60">
                <Td mono className="whitespace-nowrap text-xs text-muted">
                  {formatDateTime(r.submittedAt)}
                </Td>
                <Td>{r.incidentType ? INCIDENT_LABELS[r.incidentType] : <em className="text-subtle">belum diisi</em>}</Td>
                <Td>
                  {r.locationText ?? <em className="text-subtle">belum diisi</em>}
                  <span className="mt-0.5 block max-w-xs truncate text-xs text-subtle" title={r.rawText}>
                    {r.rawText}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={r.status} />
                    {r.duplicateOf && r.status !== "rejected" && <Badge tone="dup">Potensi duplikat</Badge>}
                  </div>
                </Td>
                <Td align="right" mono>
                  {r.needs.length}
                </Td>
                <Td>
                  {r.status === "pending_review" ? (
                    <Link
                      href={`/intake?report=${r.id}`}
                      className="text-sm font-medium text-teal-strong underline-offset-2 hover:underline"
                    >
                      Review
                    </Link>
                  ) : (
                    <span className="text-xs text-subtle">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
