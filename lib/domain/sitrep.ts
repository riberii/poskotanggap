import { priorityOf, sortByPriority, type DashboardSummary, type ShortageRow } from "./aggregation";

/**
 * Sitrep siap-salin dan ekspor CSV. Fungsi murni dan deterministik: tanpa AI, tanpa konversi satuan.
 * Nilai tidak diketahui (null) selalu ditulis "tidak diketahui" (teks) atau sel kosong (CSV), tidak pernah 0.
 */
export const SITREP_DISCLAIMER = "Data simulasi, bukan layanan darurat.";
export const SITREP_TOP_N = 5;

const WIB_OFFSET_MS = 7 * 3600_000;
const p2 = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "14 Nov 2026 09.30 WIB" (zona WIB tetap, tidak bergantung zona browser). */
export function formatWib(d: Date): string {
  const w = new Date(d.getTime() + WIB_OFFSET_MS);
  return `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]} ${w.getUTCFullYear()} ${p2(w.getUTCHours())}.${p2(w.getUTCMinutes())} WIB`;
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? "tidak diketahui" : String(n));
const qty = (n: number | null | undefined, unit: string | null | undefined) => `${num(n)}${n != null && unit ? ` ${unit}` : ""}`;

export function buildSitrep(summary: DashboardSummary, now: Date = new Date()): string {
  const critical = sortByPriority(summary.shortages).filter((r) => priorityOf(r) === "critical");
  const mismatch = summary.shortages.filter((r) => r.status === "unit_mismatch");
  const noStock = summary.shortages.filter((r) => r.status === "no_stock_record");
  const unresolved = summary.needs.unresolved;
  const L: string[] = [];
  L.push("SITREP POSKOTANGGAP", `Waktu: ${formatWib(now)}`);
  L.push(
    `Laporan: ${summary.counts.verified} terverifikasi, ${summary.counts.pendingReview} menunggu verifikasi, ${summary.counts.potentialDuplicates} potensi duplikat`,
  );

  L.push("", `KEKURANGAN KRITIS (${Math.min(critical.length, SITREP_TOP_N)} teratas dari ${critical.length})`);
  if (critical.length === 0) L.push("- Tidak ada kekurangan terhitung.");
  critical.slice(0, SITREP_TOP_N).forEach((r, i) => {
    L.push(`${i + 1}. ${r.item} — ${r.area}: butuh ${qty(r.requested, r.unit)}, stok ${qty(r.available, r.unit)}, kurang ${qty(r.shortage, r.unit)}`);
  });

  L.push("", `SATUAN TIDAK COCOK (${mismatch.length}), tidak dikonversi, perlu verifikasi manusia`);
  if (mismatch.length === 0) L.push("- Tidak ada.");
  for (const r of mismatch) {
    const other = r.otherStock.map((s) => qty(s.quantity, s.unit)).join(", ");
    L.push(`- ${r.item} — ${r.area}: butuh ${qty(r.requested, r.unit)}; stok tercatat dalam ${other || "satuan lain"}`);
  }

  const noQty = noStock.length + unresolved.length;
  L.push("", `KEBUTUHAN TANPA JUMLAH PASTI (${noQty})`);
  if (noQty === 0) L.push("- Tidak ada.");
  for (const r of noStock) L.push(`- ${r.item} — ${r.area}: butuh ${qty(r.requested, r.unit)}; stok belum tercatat (tidak diketahui)`);
  for (const u of unresolved) L.push(`- ${u.item} — ${u.area ?? "lokasi tidak diketahui"}: jumlah ${qty(u.quantity, u.unit)}${u.unit ? "" : ", satuan tidak diketahui"}`);

  L.push("", SITREP_DISCLAIMER);
  return L.join("\n");
}

/** Netralkan sel yang bisa dibaca spreadsheet sebagai rumus (awalan = + - @, tab, CR), lalu kutip bila perlu. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = ["area", "barang", "satuan", "kebutuhan", "stok", "kurang", "status"] as const;
const STATUS_TEXT: Record<ShortageRow["status"], string> = {
  shortage: "Kurang",
  sufficient: "Cukup",
  no_stock_record: "Stok belum tercatat",
  unit_mismatch: "Satuan tidak cocok",
};

/** CSV kebutuhan vs stok, urutan prioritas (kritis → peringatan → cukup). Stok/kurang tidak diketahui = sel kosong. */
export function buildNeedsCsv(summary: DashboardSummary): string {
  const rows = sortByPriority(summary.shortages).map((r) =>
    [r.area, r.item, r.unit, r.requested, r.available, r.shortage, STATUS_TEXT[r.status]].map(csvCell).join(","),
  );
  return [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}
