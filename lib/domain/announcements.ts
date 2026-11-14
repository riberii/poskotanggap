// Pengumuman: kategori, atribusi sumber, siklus publikasi. Tidak ada integrasi langsung dengan lembaga mana pun.
import { z } from "zod";

export const ANNOUNCEMENT_CATEGORIES = ["emergency_alert", "weather_warning", "evacuation", "disaster_update", "sar_update", "public_safety", "general"] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];
export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  emergency_alert: "Peringatan Darurat",
  weather_warning: "Peringatan Cuaca",
  evacuation: "Evakuasi",
  disaster_update: "Pembaruan Bencana",
  sar_update: "Pembaruan SAR",
  public_safety: "Keselamatan Publik",
  general: "Informasi Umum",
};

export const SOURCE_AGENCIES = ["BMKG", "BNPB", "BASARNAS", "BPBD"] as const;
export type SourceAgency = (typeof SOURCE_AGENCIES)[number];
export const SOURCE_AGENCY_NAMES: Record<SourceAgency, string> = {
  BMKG: "BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)",
  BNPB: "BNPB (Badan Nasional Penanggulangan Bencana)",
  BASARNAS: "BASARNAS (Badan SAR Nasional)",
  BPBD: "BPBD setempat",
};

/** official = dikutip tim dari sumber resmi (butuh rujukan, hanya admin). manual = ditulis tim. simulation = contoh. */
export const SOURCE_KINDS = ["official", "manual", "simulation"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  official: "Sumber resmi (dikutip tim)",
  manual: "Dibuat manual oleh tim posko",
  simulation: "SIMULASI",
};
export const SOURCE_KIND_NOTE: Record<SourceKind, string> = {
  official: "Dikutip dan dimasukkan manual oleh administrator dari rilis lembaga di bawah ini. Bukan umpan langsung (tidak ada integrasi API).",
  manual: "Ditulis oleh tim posko. Bukan pengumuman lembaga resmi.",
  simulation: "Data fiktif untuk demonstrasi. Jangan dijadikan acuan keselamatan.",
};

export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];
export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = { draft: "Draf", scheduled: "Terjadwal", published: "Terbit", archived: "Diarsipkan" };

export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(5, "Judul minimal 5 karakter").max(140),
    body: z.string().trim().min(10, "Isi minimal 10 karakter").max(4000),
    category: z.enum(ANNOUNCEMENT_CATEGORIES),
    sourceKind: z.enum(SOURCE_KINDS),
    sourceAgency: z.enum(SOURCE_AGENCIES).nullish(),
    /** Nama unit, mis. "BPBD Kabupaten Contoh" (wajib untuk BPBD). */
    sourceName: z.string().trim().max(120).nullish(),
    /** Rujukan sumber: tautan https atau nomor rilis. Wajib untuk sumber resmi. */
    sourceRef: z.string().trim().max(300).nullish(),
    publishAt: z.string().datetime({ offset: true }).nullish(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.sourceKind === "official") {
      if (!v.sourceAgency) ctx.addIssue({ code: "custom", path: ["sourceAgency"], message: "Pilih lembaga sumber" });
      if (!v.sourceRef) ctx.addIssue({ code: "custom", path: ["sourceRef"], message: "Rujukan sumber (tautan/nomor rilis) wajib" });
      if (v.sourceAgency === "BPBD" && !v.sourceName) ctx.addIssue({ code: "custom", path: ["sourceName"], message: "Nama BPBD wajib diisi" });
    }
    if (v.sourceRef && /^https?:/i.test(v.sourceRef) && !/^https:\/\/[^\s]+$/i.test(v.sourceRef)) ctx.addIssue({ code: "custom", path: ["sourceRef"], message: "Tautan harus https" });
  });
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const announcementActionSchema = z
  .object({ action: z.enum(["publish", "schedule", "archive", "unarchive", "draft"]), publishAt: z.string().datetime({ offset: true }).nullish() })
  .strict();

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  sourceKind: SourceKind;
  sourceAgency: SourceAgency | null;
  sourceName: string | null;
  sourceRef: string | null;
  status: AnnouncementStatus;
  publishAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Terlihat publik: terbit, atau terjadwal yang waktunya sudah lewat. */
export function isLive(a: Pick<AnnouncementView, "status" | "publishAt">, now = Date.now()): boolean {
  if (a.status === "published") return true;
  return a.status === "scheduled" && !!a.publishAt && new Date(a.publishAt).getTime() <= now;
}

export function sourceLine(a: Pick<AnnouncementView, "sourceKind" | "sourceAgency" | "sourceName">): string {
  if (a.sourceKind === "simulation") return "SIMULASI — bukan informasi resmi";
  if (a.sourceKind === "manual") return "Tim POSKOTANGGAP (manual)";
  const agency = a.sourceAgency ? (a.sourceAgency === "BPBD" && a.sourceName ? a.sourceName : a.sourceAgency) : "—";
  return `Dikutip dari ${agency}`;
}
