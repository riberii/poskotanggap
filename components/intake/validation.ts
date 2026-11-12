import { aggregateNeeds, needKey, type DashboardSummary } from "@/lib/domain/aggregation";
import { isUnitCompatible } from "@/lib/domain/catalog";
import { normalizeArea, normalizeItem } from "@/lib/domain/normalize";
import { INCIDENT_LABELS, type InventoryItem, type Report, type Unit } from "@/lib/domain/types";
import { formatArea, formatNumber } from "@/lib/format";
import type { Draft } from "./draft";

export type IssueLevel = "critical" | "warning" | "ok";

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  /** true = tombol Verifikasi dinonaktifkan sampai diperbaiki. */
  blocking?: boolean;
}

/**
 * Status validasi draf untuk operator. Hanya membaca — aturan final tetap ditegakkan service.
 * Tidak ada konversi satuan dan tidak ada angka tebakan: unknown tetap unknown.
 */
export function validateDraft(draft: Draft, ctx: { inventory: readonly InventoryItem[]; hasDuplicate: boolean }): Issue[] {
  const issues: Issue[] = [];
  const area = normalizeArea(draft.locationText);

  if (!draft.incidentType) issues.push({ level: "critical", code: "incident_missing", blocking: true, message: "Jenis kejadian belum diisi — wajib untuk verifikasi." });
  if (!area) issues.push({ level: "critical", code: "location_missing", blocking: true, message: "Lokasi belum diisi — wajib untuk verifikasi (tanpa lokasi, kebutuhan tidak bisa dibandingkan dengan stok)." });
  if (draft.needs.length === 0) issues.push({ level: "warning", code: "no_needs", message: "Tidak ada kebutuhan barang. Laporan tetap bisa diverifikasi sebagai catatan kejadian, tetapi tidak masuk rekap kebutuhan." });

  draft.needs.forEach((n, i) => {
    const label = n.item.trim() || `Kebutuhan ${i + 1}`;
    const q = n.quantity.trim().replace(",", ".");
    const hasQty = q !== "" && Number.isFinite(Number(q)) && Number(q) > 0;
    if (!n.item.trim()) issues.push({ level: "critical", code: "item_missing", blocking: true, message: `Kebutuhan ${i + 1}: nama barang wajib diisi.` });
    if (n.unit && n.item.trim() && !isUnitCompatible(n.item, n.unit as Unit)) {
      issues.push({ level: "critical", code: "unit_incompatible", blocking: true, message: `${label}: satuan “${n.unit}” tidak sesuai untuk barang ini.` });
    }
    if (!hasQty) {
      issues.push({ level: "warning", code: "qty_unknown", message: `${label}: jumlah TIDAK DIKETAHUI. Disimpan sebagai “tidak diketahui” (bukan 0) dan tidak dihitung ke rekap.` });
    } else if (!n.unit) {
      issues.push({ level: "critical", code: "unit_missing", blocking: true, message: `${label}: pilih satuan untuk jumlah ${q}.` });
    }
    if (hasQty && n.quantityBasis === "total") issues.push({ level: "warning", code: "basis_total", message: `${label}: jumlah bertipe TOTAL, bukan tambahan — tidak dijumlahkan ke rekap.` });
    if (hasQty && n.quantityBasis === "unknown") issues.push({ level: "warning", code: "basis_unknown", message: `${label}: belum jelas apakah jumlah ini tambahan atau total — tidak dihitung sampai Anda menentukan “Jenis jumlah”.` });

    // Unit mismatch terhadap stok: sama area+barang, satuan beda, dan tidak ada stok dalam satuan yang sama.
    if (hasQty && n.unit && area && n.item.trim()) {
      const item = normalizeItem(n.item);
      const same = ctx.inventory.filter((s) => s.area === area && normalizeItem(s.item) === item);
      const exact = same.some((s) => s.unit === n.unit);
      const other = same.filter((s) => s.unit !== n.unit);
      if (!exact && other.length > 0) {
        issues.push({
          level: "warning",
          code: "unit_mismatch",
          message: `${label}: UNIT MISMATCH — ${formatNumber(Number(q))} ${n.unit} dibutuhkan, stok tercatat ${other.map((s) => `${formatNumber(s.availableQuantity)} ${s.unit}`).join(" + ")}. Tidak dikonversi; kekurangan tidak dihitung — perlu verifikasi.`,
        });
      }
    }
  });

  if (ctx.hasDuplicate) issues.push({ level: "warning", code: "duplicate", message: "Potensi duplikat dengan laporan lain — putuskan di bagian “Potensi duplikat” di bawah." });
  if (!issues.some((i) => i.level !== "ok")) issues.push({ level: "ok", code: "all_ok", message: "Lokasi, jenis kejadian, dan semua kebutuhan lengkap. Siap diverifikasi." });
  else if (!issues.some((i) => i.blocking)) issues.push({ level: "ok", code: "can_verify", message: "Tidak ada yang menghalangi verifikasi. Peringatan di atas menjelaskan bagian yang tidak akan dihitung." });
  return issues;
}

/** Potongan teks untuk menyorot kalimat bukti pada teks asli. */
export interface Segment { text: string; evidence: boolean }

export function highlightSegments(raw: string, quotes: ReadonlyArray<string | null | undefined>): Segment[] {
  const ranges: Array<[number, number]> = [];
  for (const q of quotes) {
    if (!q) continue;
    const at = raw.indexOf(q);
    if (at >= 0) ranges.push([at, at + q.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: Segment[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) out.push({ text: raw.slice(pos, s), evidence: false });
    out.push({ text: raw.slice(s, e), evidence: true });
    pos = e;
  }
  if (pos < raw.length) out.push({ text: raw.slice(pos), evidence: false });
  return out.length ? out : [{ text: raw, evidence: false }];
}

/** Kalimat yang menjelaskan apa yang berubah di dashboard setelah laporan diverifikasi. */
export function describeImpact(report: Report, summary: DashboardSummary): string[] {
  if (report.status === "rejected") {
    return ["Laporan disimpan sebagai ditolak/duplikat. Tidak dihitung dan tidak mengubah rekap."];
  }
  if (report.status !== "verified") return [];
  const lines: string[] = [];
  const agg = aggregateNeeds([report]);
  for (const t of agg.totals) {
    const row = summary.shortages.find((r) => r.key === needKey(t.area, t.item, t.unit));
    const head = `${cap(t.item)} ${formatNumber(t.requested)} ${t.unit} masuk rekap ${formatArea(t.area)}`;
    if (!row) lines.push(head + ".");
    else if (row.status === "shortage") lines.push(`${head} → total dibutuhkan ${formatNumber(row.requested)}, stok ${formatNumber(row.available)}, KURANG ${formatNumber(row.shortage)} ${row.unit} (KRITIS).`);
    else if (row.status === "sufficient") lines.push(`${head} → stok mencukupi.`);
    else if (row.status === "unit_mismatch") lines.push(`${head} → UNIT MISMATCH dengan stok (${row.otherStock.map((o) => `${formatNumber(o.quantity)} ${o.unit}`).join(", ")}); perlu verifikasi.`);
    else lines.push(`${head} → stok belum tercatat, kekurangan belum bisa dihitung.`);
  }
  for (const u of agg.unresolved) {
    lines.push(`${cap(u.item)}: ${u.quantity === null ? "jumlah tidak diketahui" : "tidak dijumlahkan"} — tercatat sebagai kebutuhan tanpa jumlah pasti, bukan 0.`);
  }
  if (lines.length === 0) lines.push(`Kejadian ${report.incidentType ? INCIDENT_LABELS[report.incidentType] : ""} tercatat; tidak ada kebutuhan yang dihitung.`);
  return lines;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
