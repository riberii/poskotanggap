import { normalizeItem } from "./normalize";
import type { Unit } from "./types";

/**
 * Katalog barang umum dan satuan yang kompatibel. Barang di luar katalog
 * boleh memakai satuan baku apa pun. Barang dalam katalog dengan satuan
 * di luar daftar ditolak (mis. "beras" dalam "liter").
 * Daftar ini asumsi awal dan perlu divalidasi bersama operator posko.
 */
export const ITEM_UNIT_CATALOG: Record<string, readonly Unit[]> = {
  "air mineral": ["dus", "botol", "liter"],
  beras: ["kg", "karung"],
  "mi instan": ["dus", "paket"],
  "makanan siap saji": ["paket", "dus"],
  selimut: ["lembar", "buah"],
  tikar: ["lembar", "buah"],
  tenda: ["unit", "buah"],
  "obat-obatan": ["paket"],
  popok: ["paket"],
  pembalut: ["paket"],
};

export function isUnitCompatible(item: string, unit: Unit): boolean {
  const allowed = ITEM_UNIT_CATALOG[normalizeItem(item)];
  return allowed ? allowed.includes(unit) : true;
}
