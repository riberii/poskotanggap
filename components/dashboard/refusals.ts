import type { DashboardSummary, ExclusionReason } from "@/lib/domain/aggregation";
import { formatArea, formatNumber } from "@/lib/format";

export type RefusalKind = "unknown_quantity" | "unit_mismatch" | "basis_excluded";

export interface Refusal {
  kind: RefusalKind;
  title: string;
  /** Satu kalimat alasan mengapa sistem menolak menebak. Tetap, tidak bergantung angka. */
  reason: string;
  count: number;
  /** Contoh konkret dari data saat ini (maks 3), apa adanya. */
  examples: string[];
  /** Jumlah contoh yang tidak ditampilkan. */
  more: number;
}

const QUANTITY_REASONS: ReadonlySet<ExclusionReason> = new Set(["missing_quantity", "invalid_quantity", "missing_unit"]);
// Kebutuhan tanpa angka diberi basis "unknown" oleh ekstraktor, jadi ia masuk "jumlah tidak pasti", bukan "basis tidak jelas".
const noQuantity = (u: { reason: ExclusionReason; quantity: number | null }) =>
  QUANTITY_REASONS.has(u.reason) || (u.reason === "basis_unknown" && u.quantity === null);
const basisExcluded = (u: { reason: ExclusionReason; quantity: number | null }) =>
  u.reason === "basis_total" || (u.reason === "basis_unknown" && u.quantity !== null);
const MAX_EXAMPLES = 3;

export const REFUSAL_REASONS: Record<RefusalKind, string> = {
  unknown_quantity: "Jumlah yang tidak tertulis tidak diisi 0 atau perkiraan, karena 0 akan terbaca sebagai “tidak butuh”.",
  unit_mismatch: "Isi satu dus tidak diketahui sistem, jadi botol dan dus tidak dikonversi; selisih yang dihitung dari tebakan bisa salah.",
  basis_excluded: "Angka “total” sudah memuat bantuan yang diterima, jadi menjumlahkannya dengan “tambahan” akan menghitung ganda.",
};

function take(all: string[]): { examples: string[]; more: number } {
  return { examples: all.slice(0, MAX_EXAMPLES), more: Math.max(0, all.length - MAX_EXAMPLES) };
}

/**
 * Daftar hal yang SENGAJA tidak ditebak sistem, dihitung murni dari ringkasan dashboard.
 * Tidak mengubah angka apa pun; hanya menjelaskan apa yang dikecualikan dan mengapa.
 */
export function buildRefusals(summary: Pick<DashboardSummary, "needs" | "shortages">): Refusal[] {
  const unknownQty = summary.needs.unresolved
    .filter(noQuantity)
    .map((u) => `${u.item} · ${u.quantity === null ? "jumlah tidak diketahui" : `${formatNumber(u.quantity)} tanpa satuan`}${u.area ? ` · ${formatArea(u.area)}` : ""}`);
  const mismatch = summary.shortages
    .filter((s) => s.status === "unit_mismatch")
    .map((s) => `${s.item}: ${formatNumber(s.requested)} ${s.unit} dibutuhkan vs stok ${s.otherStock.map((o) => `${formatNumber(o.quantity)} ${o.unit}`).join(" + ")} · ${formatArea(s.area)}`);
  const basis = summary.needs.unresolved
    .filter(basisExcluded)
    .map((u) => `${u.item}${u.quantity !== null ? ` ${formatNumber(u.quantity)}${u.unit ? ` ${u.unit}` : ""}` : ""} · basis ${u.reason === "basis_total" ? "total" : "tidak jelas"}${u.area ? ` · ${formatArea(u.area)}` : ""}`);
  return [
    { kind: "unknown_quantity", title: "Jumlah tidak pasti", reason: REFUSAL_REASONS.unknown_quantity, count: unknownQty.length, ...take(unknownQty) },
    { kind: "unit_mismatch", title: "Satuan tidak cocok", reason: REFUSAL_REASONS.unit_mismatch, count: mismatch.length, ...take(mismatch) },
    { kind: "basis_excluded", title: "Total atau basis tidak jelas", reason: REFUSAL_REASONS.basis_excluded, count: basis.length, ...take(basis) },
  ];
}
