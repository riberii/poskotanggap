// Kategori insiden: kelompok → jenis. "Lainnya" mewajibkan nama kategori kustom.
import { z } from "zod";
import type { IncidentType } from "./types";

export interface CategoryOption {
  code: string;
  label: string;
}
export interface CategoryGroup {
  code: string;
  label: string;
  items: CategoryOption[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  { code: "geological", label: "Geologi", items: [
    { code: "earthquake", label: "Gempa bumi" }, { code: "tsunami", label: "Tsunami" }, { code: "volcano", label: "Erupsi gunung api" },
    { code: "landslide", label: "Tanah longsor" }, { code: "liquefaction", label: "Likuefaksi" } ] },
  { code: "hydromet", label: "Hidrometeorologi", items: [
    { code: "flood", label: "Banjir" }, { code: "flash_flood", label: "Banjir bandang" }, { code: "tidal_flood", label: "Banjir rob" },
    { code: "extreme_weather", label: "Cuaca ekstrem" }, { code: "storm", label: "Angin kencang / badai" }, { code: "drought", label: "Kekeringan" } ] },
  { code: "fire", label: "Kebakaran", items: [
    { code: "fire_residential", label: "Kebakaran permukiman" }, { code: "fire_industrial", label: "Kebakaran industri" }, { code: "fire_vehicle", label: "Kebakaran kendaraan" },
    { code: "fire_forest", label: "Kebakaran hutan" }, { code: "fire_land", label: "Kebakaran lahan" } ] },
  { code: "accident", label: "Kecelakaan", items: [
    { code: "accident_road", label: "Kecelakaan lalu lintas" }, { code: "accident_rail", label: "Kecelakaan kereta api" }, { code: "accident_air", label: "Kecelakaan penerbangan" },
    { code: "accident_sea", label: "Kecelakaan laut / pelayaran" }, { code: "accident_work", label: "Kecelakaan kerja" } ] },
  { code: "sar", label: "Pencarian & Pertolongan (SAR)", items: [
    { code: "missing_person", label: "Orang hilang" }, { code: "lost_hiker", label: "Pendaki tersesat" }, { code: "trapped", label: "Orang terjebak" }, { code: "drowning", label: "Tenggelam" } ] },
  { code: "health", label: "Kesehatan", items: [
    { code: "outbreak", label: "Wabah" }, { code: "infectious", label: "Penyakit menular" }, { code: "mass_poisoning", label: "Keracunan massal" }, { code: "medical", label: "Darurat medis" } ] },
  { code: "security", label: "Keamanan", items: [
    { code: "murder", label: "Pembunuhan" }, { code: "assault", label: "Penganiayaan" }, { code: "violence", label: "Kekerasan" }, { code: "hostage", label: "Penyanderaan" },
    { code: "bomb_threat", label: "Ancaman bom" }, { code: "terrorism", label: "Terorisme" }, { code: "riot", label: "Kerusuhan" } ] },
  { code: "infrastructure", label: "Infrastruktur", items: [
    { code: "building_collapse", label: "Bangunan runtuh" }, { code: "bridge_damage", label: "Jembatan rusak" }, { code: "gas_leak", label: "Kebocoran gas" }, { code: "power_outage", label: "Pemadaman listrik" } ] },
  { code: "environment", label: "Lingkungan", items: [
    { code: "chemical_spill", label: "Tumpahan bahan kimia" }, { code: "pollution", label: "Pencemaran" }, { code: "hazmat", label: "Bahan berbahaya (B3)" } ] },
  { code: "humanitarian", label: "Kemanusiaan", items: [
    { code: "displacement", label: "Pengungsian" }, { code: "food_shortage", label: "Kekurangan pangan" }, { code: "water_shortage", label: "Kekurangan air bersih" } ] },
  { code: "other", label: "Lainnya", items: [{ code: "other", label: "Lainnya (isi sendiri)" }] },
];

export const CUSTOM_CATEGORY_MIN = 3;
export const CUSTOM_CATEGORY_MAX = 80;

export const categorySchema = z
  .object({
    group: z.string().max(30),
    code: z.string().max(30),
    custom: z.string().trim().max(CUSTOM_CATEGORY_MAX).nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const g = CATEGORY_GROUPS.find((x) => x.code === v.group);
    if (!g || !g.items.some((i) => i.code === v.code)) return ctx.addIssue({ code: "custom", message: "Kategori tidak dikenal", path: ["code"] });
    if (v.code === "other") {
      if (!v.custom || v.custom.length < CUSTOM_CATEGORY_MIN) ctx.addIssue({ code: "custom", message: `Nama kategori wajib diisi (minimal ${CUSTOM_CATEGORY_MIN} karakter)`, path: ["custom"] });
    } else if (v.custom) ctx.addIssue({ code: "custom", message: "Kategori kustom hanya untuk “Lainnya”", path: ["custom"] });
  });
export type IncidentCategory = z.infer<typeof categorySchema>;

export function categoryLabel(c: IncidentCategory | null | undefined): string {
  if (!c) return "Belum dikategorikan";
  if (c.code === "other") return `Lainnya: ${c.custom ?? "-"}`;
  const g = CATEGORY_GROUPS.find((x) => x.code === c.group);
  return g?.items.find((i) => i.code === c.code)?.label ?? c.code;
}
export const groupLabel = (code: string | null | undefined) => CATEGORY_GROUPS.find((g) => g.code === code)?.label ?? "—";

const LEGACY: Record<string, IncidentType> = {
  flood: "banjir", flash_flood: "banjir", tidal_flood: "banjir",
  landslide: "tanah_longsor", earthquake: "gempa_bumi", storm: "angin_kencang",
  fire_residential: "kebakaran", fire_industrial: "kebakaran", fire_vehicle: "kebakaran", fire_forest: "kebakaran", fire_land: "kebakaran",
};
/** Jenis lama (dipakai ekstraksi & duplikat) yang paling dekat dengan kategori terpilih. */
export const legacyIncidentFor = (c: IncidentCategory | null | undefined): IncidentType | null => (c ? (LEGACY[c.code] ?? "lainnya") : null);
