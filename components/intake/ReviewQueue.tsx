"use client";

import { useState } from "react";
import { INCIDENT_LABELS, type Report } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
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
  if (loading && reports.length === 0) return <div role="status" aria-label="Memuat antrean" className="space-y-2"><div className="skeleton h-12" /><div className="skeleton h-12" /></div>;
  if (reports.length === 0)
    return <EmptyState tone="ok" icon="ok" title="Antrean kosong" body="Tidak ada laporan yang menunggu verifikasi." />;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="queue-search" className="mb-1.5 block text-xs font-semibold text-muted">Cari di antrean</label>
        <input
          id="queue-search"
          type="search"
          className={inputClass}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Jenis, lokasi, atau isi laporan"
        />
        <p aria-live="polite" className="mt-1.5 text-xs text-subtle">
          {query ? `${filtered.length} dari ${reports.length} laporan` : `${reports.length} laporan menunggu verifikasi`}
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
                active ? "bg-teal-accent/10 ring-1 ring-inset ring-teal-accent" : "bg-white hover:bg-navy-850"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">
                  {r.incidentType ? INCIDENT_LABELS[r.incidentType] : "Jenis tidak diketahui"}
                </span>
                {r.duplicateOf && <Badge tone="dup" icon="duplicate">Potensi duplikat</Badge>}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {r.locationText ?? "Lokasi tidak diketahui"} · {formatDateTime(r.submittedAt)}
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
