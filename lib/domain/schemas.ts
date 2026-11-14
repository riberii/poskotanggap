import { z } from "zod";
import { isUnitCompatible } from "./catalog";
import { aiInsightSchema, attachmentSchema, MAX_ATTACHMENTS } from "./insight";
import { DUPLICATE_RESOLUTIONS, INCIDENT_TYPES, QUANTITY_BASES, UNITS } from "./types";

/** Kuantitas: angka finite > 0, maksimal 2 desimal, batas atas wajar. null = tidak disebutkan. */
export const quantitySchema = z
  .number({ error: "Kuantitas harus berupa angka" })
  .finite("Kuantitas tidak valid")
  .positive("Kuantitas harus lebih dari 0")
  .max(1_000_000, "Kuantitas terlalu besar")
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Maksimal 2 desimal");

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === null || v.length === 0 ? null : v));

export const needInputSchema = z
  .object({
    item: z.string().trim().min(1, "Nama barang wajib diisi").max(80),
    quantity: quantitySchema.nullable(),
    unit: z.enum(UNITS, { error: "Satuan tidak dikenal" }).nullable(),
    quantityBasis: z.enum(QUANTITY_BASES),
    evidenceQuote: nullableText(500),
  })
  .strict()
  .superRefine((need, ctx) => {
    if (need.unit && !isUnitCompatible(need.item, need.unit)) {
      ctx.addIssue({
        code: "custom",
        path: ["unit"],
        message: `Satuan "${need.unit}" tidak kompatibel dengan "${need.item}"`,
      });
    }
    if (need.quantity !== null && need.unit === null) {
      ctx.addIssue({ code: "custom", path: ["unit"], message: "Satuan wajib bila ada kuantitas" });
    }
  });
export type NeedInput = z.infer<typeof needInputSchema>;

const reviewFields = {
  incidentType: z.enum(INCIDENT_TYPES).nullable(),
  locationText: nullableText(200),
  needs: z.array(needInputSchema).max(30, "Maksimal 30 kebutuhan per laporan"),
};

/** Body POST /api/reports — laporan baru. */
export const submitReportSchema = z
  .object({
    rawText: z.string().trim().min(5, "Teks laporan terlalu pendek").max(5000),
    ...reviewFields,
    extraction: z.unknown().nullable().optional(),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
    aiInsight: aiInsightSchema.nullable().optional(),
    action: z.enum(["save", "verify", "reject"]),
    duplicateReviewed: z.boolean().optional(),
    duplicateResolution: z.enum(DUPLICATE_RESOLUTIONS).optional(),
  })
  .strict();
export type SubmitReportInput = z.infer<typeof submitReportSchema>;

/** Body PUT /api/reports/:id — review laporan yang sudah ada. */
export const reviewReportSchema = z
  .object({
    ...reviewFields,
    action: z.enum(["save", "verify", "reject"]),
    duplicateReviewed: z.boolean().optional(),
    duplicateResolution: z.enum(DUPLICATE_RESOLUTIONS).optional(),
  })
  .strict();
export type ReviewReportInput = z.infer<typeof reviewReportSchema>;

/** Body tandai bantuan diatur. Catatan diketik operator; tidak pernah dibuat otomatis. */
export const arrangeAidSchema = z
  .object({ note: nullableText(200) })
  .strict();

/** Kode laporan pelapor (8 karakter hex dari id). */
export const reportCodeSchema = z.string().trim().regex(/^[0-9a-fA-F]{8}$/, "Kode laporan terdiri dari 8 huruf/angka.");

/** Body PUT /api/inventory — stok tidak boleh negatif. */
export const inventoryInputSchema = z
  .object({
    item: z.string().trim().min(1).max(80),
    area: z.string().trim().min(1).max(200),
    unit: z.enum(UNITS, { error: "Satuan tidak dikenal" }),
    availableQuantity: z
      .number({ error: "Jumlah stok harus berupa angka" })
      .finite()
      .min(0, "Stok tidak boleh negatif")
      .max(10_000_000),
  })
  .strict()
  .superRefine((inv, ctx) => {
    if (!isUnitCompatible(inv.item, inv.unit)) {
      ctx.addIssue({
        code: "custom",
        path: ["unit"],
        message: `Satuan "${inv.unit}" tidak kompatibel dengan "${inv.item}"`,
      });
    }
  });
export type InventoryInput = z.infer<typeof inventoryInputSchema>;

export const extractRequestSchema = z
  .object({
    rawText: z
      .string({ error: "Teks laporan wajib diisi" })
      .trim()
      .min(5, "Teks laporan kosong atau terlalu pendek")
      .max(5000, "Teks laporan terlalu panjang (maksimal 5000 karakter)"),
  })
  .strict();

export const uuidSchema = z.string().uuid();
