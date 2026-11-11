import { normalizeItem } from "./normalize";
import type { InventoryItem, Report, Unit } from "./types";

export type ExclusionReason =
  | "report_not_verified"
  | "need_not_verified"
  | "basis_total"
  | "basis_unknown"
  | "missing_quantity"
  | "invalid_quantity"
  | "missing_unit"
  | "missing_area";

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  report_not_verified: "Laporan belum terverifikasi",
  need_not_verified: "Kebutuhan belum terverifikasi",
  basis_total: "Basis kuantitas: total",
  basis_unknown: "Basis kuantitas: tidak jelas",
  missing_quantity: "Kuantitas tidak ada",
  invalid_quantity: "Kuantitas tidak valid",
  missing_unit: "Satuan tidak ada",
  missing_area: "Lokasi tidak ada",
};

export interface NeedTotal {
  key: string;
  area: string;
  item: string;
  unit: Unit;
  requested: number;
  reportCount: number;
}

export interface NeedsAggregation {
  totals: NeedTotal[];
  excluded: Record<ExclusionReason, number>;
}

export function needKey(area: string, item: string, unit: string): string {
  return `${area}|${normalizeItem(item)}|${unit}`;
}

/** Pembulatan 2 desimal agar penjumlahan desimal tetap deterministik. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isValidQuantity(q: unknown): q is number {
  return typeof q === "number" && Number.isFinite(q) && q > 0;
}

/**
 * D. Agregasi kebutuhan. Hanya kebutuhan yang:
 * - berasal dari laporan berstatus verified,
 * - ditandai verified,
 * - quantity_basis = additional,
 * - kuantitas > 0, satuan dan area ada.
 * Laporan dengan fingerprint sama tidak mungkin ada dua kali (unique di DB),
 * tetapi tetap dijaga di sini agar tidak dihitung dua kali.
 */
export function aggregateNeeds(reports: readonly Report[]): NeedsAggregation {
  const excluded: Record<ExclusionReason, number> = {
    report_not_verified: 0,
    need_not_verified: 0,
    basis_total: 0,
    basis_unknown: 0,
    missing_quantity: 0,
    invalid_quantity: 0,
    missing_unit: 0,
    missing_area: 0,
  };
  const map = new Map<string, NeedTotal & { reports: Set<string> }>();
  const seenFingerprints = new Set<string>();

  for (const report of reports) {
    if (seenFingerprints.has(report.fingerprint)) continue;
    seenFingerprints.add(report.fingerprint);

    for (const need of report.needs) {
      let reason: ExclusionReason | null = null;
      if (report.status !== "verified") reason = "report_not_verified";
      else if (!need.verified) reason = "need_not_verified";
      else if (need.quantityBasis === "total") reason = "basis_total";
      else if (need.quantityBasis === "unknown") reason = "basis_unknown";
      else if (need.quantity == null) reason = "missing_quantity";
      else if (!isValidQuantity(need.quantity)) reason = "invalid_quantity";
      else if (!need.unit) reason = "missing_unit";
      else if (!report.normalizedArea) reason = "missing_area";

      if (reason) {
        excluded[reason] += 1;
        continue;
      }
      const area = report.normalizedArea!;
      const unit = need.unit!;
      const item = normalizeItem(need.item);
      const key = needKey(area, item, unit);
      const entry = map.get(key) ?? {
        key,
        area,
        item,
        unit,
        requested: 0,
        reportCount: 0,
        reports: new Set<string>(),
      };
      entry.requested = round2(entry.requested + need.quantity!);
      entry.reports.add(report.id);
      entry.reportCount = entry.reports.size;
      map.set(key, entry);
    }
  }

  const totals = [...map.values()]
    .map(({ reports: _r, ...t }) => t)
    .sort((a, b) => a.area.localeCompare(b.area) || a.item.localeCompare(b.item));
  return { totals, excluded };
}

export type ShortageStatus = "shortage" | "sufficient" | "no_stock_record" | "unit_mismatch";

export interface ShortageRow {
  key: string;
  area: string;
  item: string;
  unit: Unit;
  requested: number;
  reportCount: number;
  available: number | null;
  shortage: number | null;
  status: ShortageStatus;
  /** Satuan stok yang tersedia untuk area+barang yang sama tetapi berbeda satuan. */
  otherStockUnits: Unit[];
}

/**
 * E. Kekurangan stok = max(0, kebutuhan − stok) untuk (area, barang, satuan)
 * yang sama persis. Tidak ada konversi satuan. Bila stok hanya tercatat dalam
 * satuan lain, status = unit_mismatch dan kekurangan tidak dihitung (null).
 */
export function computeShortages(
  totals: readonly NeedTotal[],
  inventory: readonly InventoryItem[],
): ShortageRow[] {
  const stock = new Map<string, number>();
  const unitsByAreaItem = new Map<string, Set<Unit>>();
  for (const inv of inventory) {
    if (!Number.isFinite(inv.availableQuantity) || inv.availableQuantity < 0) {
      throw new Error(`Stok tidak valid untuk ${inv.item} di ${inv.area}`);
    }
    const k = needKey(inv.area, inv.item, inv.unit);
    stock.set(k, round2((stock.get(k) ?? 0) + inv.availableQuantity));
    const ai = `${inv.area}|${normalizeItem(inv.item)}`;
    const set = unitsByAreaItem.get(ai) ?? new Set<Unit>();
    set.add(inv.unit);
    unitsByAreaItem.set(ai, set);
  }

  return totals.map((t) => {
    const available = stock.get(t.key);
    const otherStockUnits = [...(unitsByAreaItem.get(`${t.area}|${t.item}`) ?? [])].filter(
      (u) => u !== t.unit,
    );
    if (available === undefined) {
      return {
        ...t,
        available: null,
        shortage: otherStockUnits.length > 0 ? null : t.requested,
        status: otherStockUnits.length > 0 ? "unit_mismatch" : "no_stock_record",
        otherStockUnits,
      };
    }
    const shortage = round2(Math.max(0, t.requested - available));
    return {
      ...t,
      available,
      shortage,
      status: shortage > 0 ? "shortage" : "sufficient",
      otherStockUnits,
    };
  });
}

export interface DashboardSummary {
  counts: {
    verified: number;
    pendingReview: number;
    potentialDuplicates: number;
    rejected: number;
  };
  needs: NeedsAggregation;
  shortages: ShortageRow[];
  inventory: InventoryItem[];
  recentReports: Report[];
}

export function buildDashboardSummary(
  reports: readonly Report[],
  inventory: readonly InventoryItem[],
  recentLimit = 10,
): DashboardSummary {
  const needs = aggregateNeeds(reports);
  return {
    counts: {
      verified: reports.filter((r) => r.status === "verified").length,
      pendingReview: reports.filter((r) => r.status === "pending_review").length,
      potentialDuplicates: reports.filter((r) => r.duplicateOf !== null && r.status !== "rejected")
        .length,
      rejected: reports.filter((r) => r.status === "rejected").length,
    },
    needs,
    shortages: computeShortages(needs.totals, inventory),
    inventory: [...inventory].sort(
      (a, b) => a.area.localeCompare(b.area) || a.item.localeCompare(b.item),
    ),
    recentReports: [...reports]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, recentLimit),
  };
}
