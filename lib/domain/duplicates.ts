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
