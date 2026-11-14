// Parameter daftar kasus untuk Pusat Operasi (dipakai server dan tes).
import { z } from "zod";
import { CASE_PRIORITIES, CASE_STATUSES } from "@/lib/domain/case";

const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());

export const listQuerySchema = z.object({
  q: opt(z.string().trim().max(100)),
  status: opt(z.enum(CASE_STATUSES)),
  priority: opt(z.enum(CASE_PRIORITIES)),
  group: opt(z.string().max(30)),
  category: opt(z.string().max(30)),
  sim: z.preprocess((v) => v ?? undefined, z.enum(["all", "real", "sim"]).default("all")),
  archived: z.preprocess((v) => v ?? undefined, z.enum(["0", "1", "all"]).default("0")),
  appeal: opt(z.enum(["pending"])),
  from: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  sort: z.preprocess((v) => v ?? undefined, z.enum(["submitted", "updated", "priority", "status"]).default("submitted")),
  dir: z.preprocess((v) => v ?? undefined, z.enum(["asc", "desc"]).default("desc")),
  page: z.preprocess((v) => (v ? Number(v) : undefined), z.number().int().min(1).max(10_000).default(1)),
  pageSize: z.preprocess((v) => (v ? Number(v) : undefined), z.union([z.literal(10), z.literal(25), z.literal(50)]).default(25)),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const parseListQuery = (sp: URLSearchParams) => listQuerySchema.safeParse(Object.fromEntries(sp.entries()));
