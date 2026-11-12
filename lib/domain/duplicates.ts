import type { IncidentType, Report } from "./types";

/** A. Duplikat persis: fingerprint identik dengan laporan yang sudah ada. */
export function findExactDuplicate(
  fingerprint: string,
  existing: readonly Pick<Report, "id" | "fingerprint">[],
): string | null {
  return existing.find((r) => r.fingerprint === fingerprint)?.id ?? null;
}

/**
 * B. Potensi duplikat: area ternormalisasi DAN jenis kejadian sama dengan
 * laporan lain yang tidak ditolak. Hanya menandai — tidak pernah menghapus
 * atau menggabungkan. Mengembalikan laporan paling awal sebagai acuan.
 * Bila area atau jenis kejadian null, tidak ada pencocokan (tidak cukup bukti).
 */
export function findPotentialDuplicate(
  candidate: { id?: string; normalizedArea: string | null; incidentType: IncidentType | null },
  existing: readonly Pick<
    Report,
    "id" | "normalizedArea" | "incidentType" | "status" | "submittedAt"
  >[],
): string | null {
  if (!candidate.normalizedArea || !candidate.incidentType) return null;
  const matches = existing
    .filter(
      (r) =>
        r.id !== candidate.id &&
        r.status !== "rejected" &&
        r.normalizedArea === candidate.normalizedArea &&
        r.incidentType === candidate.incidentType,
    )
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id));
  return matches[0]?.id ?? null;
}

export interface DuplicateComparison {
  /** Alasan sistem menganggap kedua laporan mirip (selalu minimal area & jenis kejadian). */
  reasons: string[];
  /** Barang yang disebut di kedua laporan, dengan jumlah masing-masing (null = tidak diketahui). */
  sharedItems: Array<{ item: string; a: string; b: string; differs: boolean }>;
  /** Selisih penting yang perlu diperhatikan operator. */
  notes: string[];
}

type CompareSide = Pick<Report, "locationText" | "incidentType" | "needs" | "normalizedArea">;

const fmtQty = (n: { quantity: number | null; unit: string | null }) =>
  n.quantity === null ? "jumlah tidak diketahui" : `${n.quantity}${n.unit ? ` ${n.unit}` : ""}`;

/**
 * Menjelaskan MENGAPA dua laporan dianggap berpotensi duplikat. Murni tampilan:
 * tidak mengubah data dan tidak memengaruhi agregasi.
 */
export function explainDuplicate(
  a: { normalizedArea: string | null; incidentType: IncidentType | null; needs: Array<{ item: string; quantity: number | null; unit: string | null }> },
  b: CompareSide,
  incidentLabel: (t: IncidentType) => string,
): DuplicateComparison {
  const reasons: string[] = [];
  if (a.normalizedArea && a.normalizedArea === b.normalizedArea) reasons.push("Lokasi (area) sama");
  if (a.incidentType && a.incidentType === b.incidentType) reasons.push(`Jenis kejadian sama: ${incidentLabel(a.incidentType)}`);

  const sharedItems: DuplicateComparison["sharedItems"] = [];
  for (const na of a.needs) {
    const nb = b.needs.find((x) => x.item.trim().toLowerCase() === na.item.trim().toLowerCase());
    if (!nb) continue;
    const qa = fmtQty(na);
    const qb = fmtQty(nb);
    sharedItems.push({ item: na.item, a: qa, b: qb, differs: qa !== qb });
  }
  if (sharedItems.length > 0) reasons.push(`Barang yang sama disebut: ${sharedItems.map((s) => s.item).join(", ")}`);

  const notes: string[] = [];
  if (sharedItems.some((s) => s.differs)) notes.push("Jumlah berbeda — bisa laporan susulan (update) atau kebutuhan baru. Periksa teks asli.");
  if (sharedItems.length === 0) notes.push("Tidak ada barang yang sama — kemungkinan melaporkan kebutuhan berbeda di lokasi yang sama.");
  return { reasons, sharedItems, notes };
}
