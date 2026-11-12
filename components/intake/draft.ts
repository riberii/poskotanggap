import type { ReviewPayload } from "@/lib/api-client";
import type { ExtractionResult, IncidentType, QuantityBasis, Report, Unit } from "@/lib/domain/types";

/** State form review di browser. Kuantitas disimpan sebagai string agar input bisa kosong. */
export interface DraftNeed {
  key: string;
  item: string;
  quantity: string;
  unit: Unit | "";
  quantityBasis: QuantityBasis;
  evidenceQuote: string | null;
}

export interface Draft {
  incidentType: IncidentType | "";
  locationText: string;
  needs: DraftNeed[];
}

let counter = 0;
export const newKey = () => `n${Date.now()}-${counter++}`;

export function draftFromExtraction(e: ExtractionResult): Draft {
  return {
    incidentType: e.incidentType ?? "",
    locationText: e.locationText ?? "",
    needs: e.needs.map((n) => ({
      key: newKey(),
      item: n.item,
      quantity: n.quantity === null ? "" : String(n.quantity),
      unit: n.unit ?? "",
      quantityBasis: n.quantityBasis,
      evidenceQuote: n.evidenceQuote,
    })),
  };
}

export function draftFromReport(r: Report): Draft {
  return {
    incidentType: r.incidentType ?? "",
    locationText: r.locationText ?? "",
    needs: r.needs.map((n) => ({
      key: newKey(),
      item: n.item,
      quantity: n.quantity === null ? "" : String(n.quantity),
      unit: n.unit ?? "",
      quantityBasis: n.quantityBasis,
      evidenceQuote: n.evidenceQuote,
    })),
  };
}

/** Konversi draft ke payload. Validasi final tetap di server. */
export function draftToPayload(d: Draft): ReviewPayload {
  return {
    incidentType: d.incidentType || null,
    locationText: d.locationText.trim() || null,
    needs: d.needs.map((n) => {
      const q = n.quantity.trim().replace(",", ".");
      return {
        item: n.item.trim(),
        quantity: q === "" ? null : Number(q),
        unit: n.unit || null,
        quantityBasis: n.quantityBasis,
        evidenceQuote: n.evidenceQuote,
      };
    }),
  };
}

/**
 * Pemeriksaan ringan di browser (mis. teks bukan angka akan menjadi null saat
 * diserialisasi JSON, jadi harus dicegat di sini). Aturan lengkap tetap di server.
 */
export function draftClientErrors(d: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  d.needs.forEach((n, i) => {
    const q = n.quantity.trim().replace(",", ".");
    if (!n.item.trim()) errors[`needs.${i}.item`] = "Nama barang wajib diisi";
    if (q !== "") {
      const num = Number(q);
      if (!Number.isFinite(num) || num <= 0) errors[`needs.${i}.quantity`] = "Kuantitas harus angka > 0";
      else if (num > 1_000_000) errors[`needs.${i}.quantity`] = "Kuantitas maksimal 1.000.000";
      else if (Math.abs(Math.round(num * 100) - num * 100) >= 1e-6) errors[`needs.${i}.quantity`] = "Maksimal 2 desimal";
      else if (!n.unit) errors[`needs.${i}.unit`] = "Pilih satuan";
    }
  });
  return errors;
}
