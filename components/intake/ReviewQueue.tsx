"use client";

import { useState } from "react";
import { INCIDENT_LABELS, type Report } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { inputClass } from "@/components/ui/form";

export function ReviewQueue({
  reports,
  activeId,
  loading,
  error,
  disabled,
  onSelect,
  onRetry,
}: {
  reports: Report[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("id-ID");
  const filtered = reports.filter((report) =>
    [report.incidentType ? INCIDENT_LABELS[report.incidentType] : "", report.locationText ?? "", report.rawText]
      .some((value) => value.toLocaleLowerCase("id-ID").includes(query)),
  );

  if (error) return <div role="alert" className="space-y-2 text-sm text-danger"><p>{error}</p><button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">Coba muat lagi</button></div>;
  if (loading && reports.length === 0) return <p className="text-sm text-subtle">Memuat antrian…</p>;
  if (reports.length === 0)
    return <p className="text-sm text-subtle">Tidak ada laporan yang menunggu review.</p>;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="queue-search" className="mb-1.5 block text-xs font-semibold text-muted">Cari antrean</label>
        <input
          id="queue-search"
          type="search"
          className={inputClass}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Jenis, lokasi, atau isi laporan"
        />
        <p aria-live="polite" className="mt-1.5 text-xs text-subtle">
          {query ? `${filtered.length} dari ${reports.length} laporan` : `${reports.length} laporan menunggu review`}
        </p>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-navy-700 px-3 py-4 text-sm text-muted">Tidak ada laporan yang cocok. Coba kata kunci lain.</p>
      ) : (
      <ul className="divide-y divide-navy-700 overflow-hidden rounded-md border border-navy-700">
      {filtered.map((r) => {
        const active = r.id === activeId;
        return (
          <li key={r.id}>
            <button
              type="button"
              disabled={disabled}
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
      )}
    </div>
  );
}
