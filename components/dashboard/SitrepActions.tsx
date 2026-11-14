import { useState } from "react";
import type { DashboardSummary } from "@/lib/domain/aggregation";
import { buildNeedsCsv, buildSitrep } from "@/lib/domain/sitrep";
import { Button } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/InfoTip";

/** Sitrep dan CSV dibuat deterministik dari angka dashboard (tanpa AI). */
export function SitrepActions({ summary }: { summary: DashboardSummary }) {
  const [note, setNote] = useState<string | null>(null);

  async function copy() {
    const text = buildSitrep(summary);
    try {
      await navigator.clipboard.writeText(text);
      setNote("Sitrep disalin.");
    } catch {
      // Cadangan untuk browser tanpa izin clipboard.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      setNote(ok ? "Sitrep disalin." : "Gagal menyalin. Salin manual dari layar.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob(["﻿" + buildNeedsCsv(summary)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "kebutuhan-vs-stok.csv";
    a.click();
    URL.revokeObjectURL(url);
    setNote("CSV diunduh.");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => void copy()}>Salin sitrep</Button>
      <Button onClick={download}>Unduh CSV</Button>
      <InfoTip>Teks ringkasan dibuat dari angka di halaman ini oleh kode biasa, bukan AI. Nilai yang tidak diketahui ditulis “tidak diketahui”, bukan 0. Data simulasi.</InfoTip>
      <span role="status" className="text-xs text-muted">{note}</span>
    </div>
  );
}
