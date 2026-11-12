import { priorityOf, sortByPriority, type DashboardSummary } from "@/lib/domain/aggregation";
import { formatArea, formatNumber } from "@/lib/format";

export type Severity = "critical" | "warning" | "info";

export interface AttentionItem {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  href?: string;
  actionLabel?: string;
}

const qty = (n: number | null, unit: string) => `${formatNumber(n)} ${unit}`;

/**
 * Menyusun daftar "yang perlu perhatian sekarang" dari ringkasan dashboard.
 * Murni dan deterministik: urutan KRITIS → PERINGATAN → INFORMASI, tanpa asumsi angka.
 */
export function buildAttention(s: DashboardSummary): AttentionItem[] {
  const items: AttentionItem[] = [];
  const rows = sortByPriority(s.shortages);

  // KRITIS — kebutuhan belum terpenuhi (hanya dari data valid & terverifikasi)
  const critical = rows.filter((r) => priorityOf(r) === "critical");
  critical.slice(0, 3).forEach((r) =>
    items.push({
      id: `short-${r.key}`,
      severity: "critical",
      title: `Kurang ${qty(r.shortage, r.unit)} ${r.item} di ${formatArea(r.area)}`,
      detail: `Dibutuhkan ${qty(r.requested, r.unit)}, tersedia ${qty(r.available, r.unit)}.`,
      href: "#needs",
      actionLabel: "Lihat rekap",
    }),
  );
  if (critical.length > 3) {
    items.push({ id: "short-more", severity: "critical", title: `+${critical.length - 3} kekurangan lainnya`, href: "#needs", actionLabel: "Lihat semua" });
  }

  // PERINGATAN
  const firstDup = s.pendingReports.find((r) => r.duplicateOf);
  if (s.counts.potentialDuplicates > 0) {
    items.push({
      id: "dup",
      severity: "warning",
      title: `${s.counts.potentialDuplicates} laporan berpotensi duplikat`,
      detail: "Belum dihitung. Operator memutuskan: konfirmasi duplikat, pertahankan keduanya, atau tinjau nanti.",
      href: firstDup ? `/intake?report=${firstDup.id}` : "/intake",
      actionLabel: "Putuskan",
    });
  }
  const pendingOnly = s.counts.pendingReview - s.counts.potentialDuplicates;
  if (pendingOnly > 0) {
    const first = s.pendingReports.find((r) => !r.duplicateOf);
    items.push({
      id: "pending",
      severity: "warning",
      title: `${pendingOnly} laporan menunggu verifikasi`,
      detail: "Belum masuk rekap sampai operator memverifikasi.",
      href: first ? `/intake?report=${first.id}` : "/intake",
      actionLabel: "Verifikasi",
    });
  }
  rows
    .filter((r) => r.status === "unit_mismatch")
    .forEach((r) =>
      items.push({
        id: `mm-${r.key}`,
        severity: "warning",
        title: `Satuan tidak cocok: ${r.item} di ${formatArea(r.area)}`,
        detail: `${qty(r.requested, r.unit)} dibutuhkan, tetapi stok ${r.otherStock.map((o) => qty(o.quantity, o.unit)).join(" + ")}. Tidak dikonversi — perlu verifikasi.`,
        href: "#needs",
        actionLabel: "Lihat",
      }),
    );
  const noStock = rows.filter((r) => r.status === "no_stock_record").length;
  if (noStock > 0) {
    items.push({
      id: "nostock",
      severity: "warning",
      title: `Stok belum tercatat untuk ${noStock} kebutuhan`,
      detail: "Kekurangan belum bisa dihitung. Catat stok agar sistem dapat membandingkan.",
      href: "#inventory",
      actionLabel: "Catat stok",
    });
  }
  if (s.needs.unresolved.length > 0) {
    items.push({
      id: "unknown",
      severity: "warning",
      title: `${s.needs.unresolved.length} kebutuhan terverifikasi belum punya jumlah pasti`,
      detail: "Ditampilkan sebagai “tidak diketahui”, tidak dihitung sebagai 0.",
      href: "#unknown",
      actionLabel: "Lihat",
    });
  }

  // INFORMASI
  if (s.needs.totals.length > 0 && critical.length === 0 && rows.every((r) => priorityOf(r) === "ok")) {
    items.push({ id: "allok", severity: "info", title: "Semua kebutuhan terverifikasi tercukupi oleh stok", detail: "Tidak ada kekurangan pada data yang valid." });
  }
  items.push({
    id: "verified",
    severity: "info",
    title: `${s.counts.verified} laporan terverifikasi masuk rekap`,
    detail: s.counts.rejected > 0 ? `${s.counts.rejected} laporan ditolak/duplikat disimpan, tidak dihitung.` : undefined,
  });
  return items;
}
