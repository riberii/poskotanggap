import { priorityOf, sortByPriority, type DashboardSummary } from "@/lib/domain/aggregation";
import { DANGER_LABELS, detectDanger } from "@/lib/domain/danger";
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

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
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
      title: `${capitalize(r.item)} · kurang ${qty(r.shortage, r.unit)}`,
      detail: `${formatArea(r.area)}: ${qty(r.requested, r.unit)} dibutuhkan · ${qty(r.available, r.unit)} tersedia · ${r.reportCount} laporan.`,
      href: "#needs",
      actionLabel: "Periksa kebutuhan",
    }),
  );
  if (critical.length > 3) {
    items.push({ id: "short-more", severity: "critical", title: `+${critical.length - 3} kekurangan lainnya`, href: "#needs", actionLabel: "Lihat semua" });
  }

  // PERINGATAN — kata bahaya dideteksi KODE dari teks laporan (bukan AI) untuk laporan yang belum diperiksa
  const urgent = s.pendingReports.map((r) => ({ r, signals: detectDanger(r.rawText) })).filter((x) => x.signals.length > 0);
  urgent.slice(0, 2).forEach(({ r, signals }) =>
    items.push({
      id: `emg-${r.id}`,
      severity: "warning",
      title: `${signals.map((x) => DANGER_LABELS[x.kind]).join(", ")} — ${r.locationText ?? "lokasi belum jelas"}`,
      detail: `Kata di laporan: “${signals.map((x) => x.match).join("”, “")}”. Buka laporan untuk tombol telepon.`,
      href: `/intake?report=${r.id}`,
      actionLabel: "Buka & hubungi",
    }),
  );
  const doubtful = s.pendingReports.filter((r) => r.aiInsight && r.aiInsight.authenticity.level !== "wajar").length;
  if (doubtful > 0) {
    items.push({
      id: "ai-doubt",
      severity: "warning",
      title: `${doubtful} laporan perlu dicek keasliannya`,
      detail: "Menurut saran AI. Bukan vonis — periksa teks dan lampiran sebelum verifikasi.",
      href: `/intake?report=${s.pendingReports.find((r) => r.aiInsight && r.aiInsight.authenticity.level !== "wajar")!.id}`,
      actionLabel: "Periksa",
    });
  }
  const firstDup = s.pendingReports.find((r) => r.duplicateOf);
  if (s.counts.potentialDuplicates > 0) {
    items.push({
      id: "dup",
      severity: "warning",
      title: `${s.counts.potentialDuplicates} laporan mirip laporan lain (potensi duplikat)`,
      detail: "Belum dihitung agar tidak dobel. Bandingkan lalu putuskan.",
      href: firstDup ? `/intake?report=${firstDup.id}` : "/intake",
      actionLabel: "Bandingkan",
    });
  }
  const pendingOnly = s.counts.pendingReview - s.counts.potentialDuplicates;
  if (pendingOnly > 0) {
    const first = s.pendingReports.find((r) => !r.duplicateOf);
    items.push({
      id: "pending",
      severity: "warning",
      title: `${pendingOnly} laporan menunggu verifikasi`,
      detail: "Belum masuk rekap sebelum diperiksa dan diverifikasi.",
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
        title: `${capitalize(r.item)} — ${formatArea(r.area)}: satuan berbeda`,
        detail: `Dibutuhkan ${qty(r.requested, r.unit)}, stok tercatat ${r.otherStock.map((o) => qty(o.quantity, o.unit)).join(" + ")}. Kekurangan tidak dihitung karena konversi belum diketahui.`,
        href: "#needs",
        actionLabel: "Cek satuan",
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
      title: `${s.needs.unresolved.length} kebutuhan belum punya jumlah pasti`,
      detail: "Jumlahnya “tidak diketahui” (bukan 0) dan tidak masuk hitungan kekurangan. Hubungi pelapor.",
      href: "#unknown",
      actionLabel: "Lihat daftar",
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
