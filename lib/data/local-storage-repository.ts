import { z } from "zod";
import { storedExtractionSchema } from "@/lib/domain/ai-extraction";
import { INCIDENT_TYPES, QUANTITY_BASES, REPORT_STATUSES, UNITS, type InventoryItem, type Report } from "@/lib/domain/types";
import { MockRepository } from "./mock-repository";
import { buildSeed } from "./seed-data";

/**
 * MODE PROTOTIPE: seluruh data operasional disimpan di localStorage browser ini.
 * - Data hanya ada di browser & perangkat ini; TIDAK tersinkron antar perangkat/pengguna.
 * - Isi storage divalidasi dengan Zod saat dimuat; data rusak/tidak dikenal
 *   tidak dipakai — diganti data simulasi awal dan operator diberi tahu.
 * - Hanya untuk data simulasi. Jangan simpan data penyintas sungguhan.
 */

export const STORAGE_KEY = "poskotanggap:v1";
const STATE_VERSION = 1;

/** Subset Storage API agar bisa diuji tanpa browser. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const id = z.string().uuid();
const iso = z.string().datetime({ offset: true });

const needSchema = z
  .object({
    id,
    reportId: id,
    item: z.string().min(1).max(80),
    quantity: z.number().finite().positive().max(1_000_000).nullable(),
    unit: z.enum(UNITS).nullable(),
    quantityBasis: z.enum(QUANTITY_BASES),
    evidenceQuote: z.string().max(500).nullable(),
    verified: z.boolean(),
  })
  .strict();

const reportSchema = z
  .object({
    id,
    rawText: z.string().min(1).max(5000),
    submittedAt: iso,
    incidentType: z.enum(INCIDENT_TYPES).nullable(),
    locationText: z.string().max(200).nullable(),
    normalizedArea: z.string().max(200).nullable(),
    status: z.enum(REPORT_STATUSES),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    duplicateOf: id.nullable(),
    extraction: storedExtractionSchema.nullable(),
    createdAt: iso,
    verifiedAt: iso.nullable(),
    needs: z.array(needSchema).max(30),
  })
  .strict();

const inventorySchema = z
  .object({
    id,
    item: z.string().min(1).max(80),
    area: z.string().min(1).max(200),
    unit: z.enum(UNITS),
    availableQuantity: z.number().finite().min(0).max(10_000_000),
    updatedAt: iso,
  })
  .strict();

const stateSchema = z
  .object({
    version: z.literal(STATE_VERSION),
    reports: z.array(reportSchema).max(5000),
    inventory: z.array(inventorySchema).max(5000),
  })
  .strict()
  .superRefine((s, ctx) => {
    // Invarian yang juga dijaga database di mode Supabase.
    const fps = new Set<string>();
    for (const r of s.reports) {
      if (fps.has(r.fingerprint)) ctx.addIssue({ code: "custom", message: "fingerprint ganda" });
      fps.add(r.fingerprint);
      if ((r.status === "verified") !== (r.verifiedAt !== null)) ctx.addIssue({ code: "custom", message: "verifiedAt tidak konsisten" });
    }
  });

export type LoadOutcome = "seeded" | "loaded" | "recovered_from_corruption";

export function loadState(storage: KeyValueStorage): { reports: Report[]; inventory: InventoryItem[]; outcome: LoadOutcome } {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    // Storage diblokir (mis. mode privat ketat) — mulai dari seed.
  }
  if (raw === null) return { ...buildSeed(), outcome: "seeded" };
  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { reports: parsed.data.reports as Report[], inventory: parsed.data.inventory, outcome: "loaded" };
  } catch {
    // JSON rusak — ditangani di bawah.
  }
  return { ...buildSeed(), outcome: "recovered_from_corruption" };
}

export class LocalStorageRepository extends MockRepository {
  readonly loadOutcome: LoadOutcome;
  /** true bila penulisan terakhir ke storage gagal (mis. kuota penuh). */
  lastPersistFailed = false;

  constructor(private readonly storage: KeyValueStorage) {
    const state = loadState(storage);
    super({ reports: state.reports, inventory: state.inventory });
    this.loadOutcome = state.outcome;
    // Seed / pemulihan langsung ditulis agar state di storage selalu valid.
    if (state.outcome !== "loaded") this.persist();
  }

  protected override persist(): void {
    try {
      this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: STATE_VERSION, reports: this.reports, inventory: this.inventory }),
      );
      this.lastPersistFailed = false;
    } catch {
      this.lastPersistFailed = true;
    }
  }

  /** Mengembalikan data ke data simulasi awal (menghapus semua perubahan di browser ini). */
  reset(): void {
    const seed = buildSeed();
    this.reports = seed.reports;
    this.inventory = seed.inventory;
    this.persist();
  }
}
