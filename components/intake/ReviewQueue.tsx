"use client";

import { INCIDENT_LABELS, type Report } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";

export function ReviewQueue({
  reports,
  activeId,
  loading,
  error,
  onSelect,
}: {
  reports: Report[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
}) {
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (loading && reports.length === 0) return <p className="text-sm text-subtle">Memuat antrian…</p>;
  if (reports.length === 0)
    return <p className="text-sm text-subtle">Tidak ada laporan yang menunggu review.</p>;

  return (
    <ul className="divide-y divide-navy-700 overflow-hidden rounded-md border border-navy-700">
      {reports.map((r) => {
        const active = r.id === activeId;
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-current={active ? "true" : undefined}
              className={`block w-full px-3 py-2.5 text-left transition-colors ${
                active ? "bg-navy-700" : "bg-navy-850 hover:bg-navy-800"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">
                  {r.incidentType ? INCIDENT_LABELS[r.incidentType] : "Jenis belum diisi"}
                </span>
                {r.duplicateOf && <Badge tone="dup">Potensi duplikat</Badge>}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {r.locationText ?? "Lokasi belum diisi"} · {formatDateTime(r.submittedAt)}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
