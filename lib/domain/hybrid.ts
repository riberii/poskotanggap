import { normalizeItem } from "./normalize";
import type { ExtractionCheck, ExtractionResult } from "./types";

/**
 * Penggabung DUA PEMBACA independen (aturan dan AI). Murni & deterministik.
 * - Sepakat → nilai dipertahankan.
 * - Berbeda → nilai dikosongkan (null / unknown) dan dicatat di `checks`; tidak ada yang dipilih diam-diam.
 * - Hanya satu pembaca menemukan → dipertahankan (sudah lolos validasi bukti) dengan catatan siapa yang menemukan.
 * Hasil tetap DRAF; angka yang dijumlahkan tetap hanya dari laporan yang diverifikasi manusia.
 */
const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

type Need = ExtractionResult["needs"][number];
const needLabel = (n: Need) => `${n.quantity ?? "?"} ${n.unit ?? "?"} (${n.quantityBasis})`;

export function mergeReaders(rules: ExtractionResult, ai: ExtractionResult): ExtractionResult {
  const checks: ExtractionCheck[] = [];

  const scalar = (field: string, label: string, r: string | null, a: string | null): string | null => {
    if (r === null && a === null) return null;
    if (r !== null && a !== null) {
      if (norm(r) === norm(a)) return r;
      checks.push({ field, message: `${label}: aturan dan AI berbeda. Periksa teks asli.`, rules: r, ai: a });
      return null;
    }
    checks.push({
      field,
      message: `${label}: hanya ${r !== null ? "aturan" : "AI"} yang menemukan.`,
      rules: r,
      ai: a,
    });
    return r ?? a;
  };

  const incidentType = scalar("incident", "Jenis kejadian", rules.incidentType, ai.incidentType) as ExtractionResult["incidentType"];
  const incidentEvidence = incidentType === null ? null : rules.incidentType === incidentType ? rules.incidentEvidence : ai.incidentEvidence;

  const locationText = scalar("location", "Lokasi", rules.locationText, ai.locationText);
  const locationEvidence = locationText === null ? null : rules.locationText === locationText ? rules.locationEvidence : ai.locationEvidence;

  const occurredAtText = ai.occurredAtText ?? rules.occurredAtText;

  const byItem = new Map<string, { r?: Need; a?: Need }>();
  for (const n of rules.needs) byItem.set(normalizeItem(n.item), { r: n });
  for (const n of ai.needs) {
    const k = normalizeItem(n.item);
    byItem.set(k, { ...byItem.get(k), a: n });
  }

  const needs: Need[] = [];
  for (const [item, { r, a }] of byItem) {
    if (r && !a) {
      checks.push({ field: `need:${item}`, message: `${item}: hanya aturan yang menemukan.`, rules: needLabel(r), ai: null });
      needs.push(r);
    } else if (a && !r) {
      checks.push({ field: `need:${item}`, message: `${item}: hanya AI yang menemukan.`, rules: null, ai: needLabel(a) });
      needs.push(a);
    } else if (r && a) {
      const same = r.quantity === a.quantity && r.unit === a.unit && r.quantityBasis === a.quantityBasis;
      if (same) {
        needs.push(r);
        continue;
      }
      // Satu pembaca kosong (abstain) bukan pertentangan: nilai pembaca lain dipertahankan dan ditandai.
      // Dua pembaca sama-sama mengisi tetapi berbeda: dikosongkan.
      const pick = <T,>(x: T, y: T, empty: T): { v: T; conflict: boolean } =>
        x === y ? { v: x, conflict: false }
        : x === empty ? { v: y, conflict: false }
        : y === empty ? { v: x, conflict: false }
        : { v: empty, conflict: true };
      const q = pick(r.quantity, a.quantity, null);
      const u = pick(r.unit, a.unit, null);
      const bs = pick(r.quantityBasis, a.quantityBasis, "unknown" as const);
      const quantity = q.v;
      const unit = u.v;
      const quantityBasis = quantity === null ? "unknown" : bs.v;
      const conflict = q.conflict || u.conflict || bs.conflict;
      checks.push({
        field: `need:${item}`,
        message: conflict
          ? `${item}: aturan dan AI berbeda, bagian yang berbeda dikosongkan.`
          : `${item}: hanya satu pembaca yang mengisi jumlah/satuan/jenis. Periksa.`,
        rules: needLabel(r),
        ai: needLabel(a),
      });
      needs.push({ item: r.item, quantity, unit, quantityBasis, evidenceQuote: quantity !== null && quantity === a.quantity && quantity !== r.quantity ? a.evidenceQuote : (r.evidenceQuote ?? a.evidenceQuote) });
    }
  }

  const warnings = [...new Set([...rules.warnings.filter((w) => !w.startsWith("Ekstraksi berbasis aturan")), ...ai.warnings])];
  if (incidentType === null && !warnings.includes("Jenis kejadian tidak ditemukan.")) warnings.push("Jenis kejadian tidak ditemukan.");
  if (locationText === null && !warnings.includes("Lokasi tidak ditemukan.")) warnings.push("Lokasi tidak ditemukan.");

  return {
    source: "hybrid",
    model: ai.model,
    incidentType,
    incidentEvidence,
    locationText,
    locationEvidence,
    occurredAtText,
    needs,
    uncertainties: [...new Set([...rules.uncertainties, ...ai.uncertainties])],
    checks,
    warnings: [...new Set(warnings)],
  };
}
