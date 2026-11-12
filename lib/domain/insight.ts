import { z } from "zod";
import { AUTHENTICITY_LEVELS, EMERGENCY_SERVICES } from "./types";

/** Batas ukuran lampiran agar tetap muat di localStorage. */
export const MAX_ATTACHMENTS = 3;
export const MAX_DATA_URL_CHARS = 450_000;

export const attachmentSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(["image", "video", "file"]),
    name: z.string().min(1).max(200),
    mime: z.string().max(100),
    size: z.number().int().min(0),
    dataUrl: z
      .string()
      .max(MAX_DATA_URL_CHARS, "Lampiran terlalu besar")
      .regex(/^data:[\w.+/-]+;base64,/, "Format lampiran tidak valid")
      .nullable(),
  })
  .strict();

const text = (max: number) => z.string().trim().max(max);

export const aiInsightSchema = z
  .object({
    summary: text(600),
    mediaDescription: text(800).nullable(),
    language: text(60).nullable(),
    translation: text(5000).nullable(),
    authenticity: z.object({ level: z.enum(AUTHENTICITY_LEVELS), reasons: z.array(text(240)).max(5) }).strict(),
    suggestions: z.array(text(240)).max(5),
    emergency: z.object({ service: z.enum(EMERGENCY_SERVICES), reason: text(240) }).strict(),
    model: text(80),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const AUTHENTICITY_LABELS = {
  wajar: "Tampak wajar",
  perlu_dicek: "Perlu dicek",
  mencurigakan: "Mencurigakan",
} as const;

export const EMERGENCY_LABELS = {
  damkar: "Pemadam kebakaran",
  ambulans: "Ambulans",
  keduanya: "Pemadam kebakaran & ambulans",
  tidak_perlu: "Belum perlu layanan darurat",
} as const;

export interface EmergencyAction {
  key: "damkar" | "ambulans";
  label: string;
  number: string;
  /** Pencarian peta untuk layanan terdekat dari lokasi laporan. */
  mapsUrl: string;
}

/** Nomor nasional (tersambung ke layanan setempat). Murni; tidak memanggil apa pun. */
export function emergencyActions(service: keyof typeof EMERGENCY_LABELS, location: string | null): EmergencyAction[] {
  const near = (q: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location ? `${q} dekat ${location}` : q)}`;
  const damkar: EmergencyAction = { key: "damkar", label: "Hubungi Damkar", number: "113", mapsUrl: near("pemadam kebakaran") };
  const ambulans: EmergencyAction = { key: "ambulans", label: "Hubungi Ambulans", number: "119", mapsUrl: near("ambulans rumah sakit") };
  if (service === "damkar") return [damkar];
  if (service === "ambulans") return [ambulans];
  if (service === "keduanya") return [damkar, ambulans];
  return [];
}
