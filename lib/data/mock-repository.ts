import type { FollowUp, InventoryItem, Report } from "@/lib/domain/types";
import {
  ExactDuplicateError,
  type DataMode,
  type DataRepository,
  type InventoryRecord,
  type NewReportRecord,
  type ReportUpdateRecord,
} from "./repository";
import { buildSeed } from "./seed-data";

/** UUID v4 dari Web Crypto (tersedia di browser modern dan Node 19+). */
export function randomUUID(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Repository in-memory berisi DATA SIMULASI. Dipakai di unit test dan sebagai
 * dasar LocalStorageRepository (mode prototipe di browser). Subclass dapat
 * meng-override persist() untuk menyimpan state setelah setiap perubahan.
 */
export class MockRepository implements DataRepository {
  readonly mode: DataMode = "local";
  protected reports: Report[];
  protected inventory: InventoryItem[];

  constructor(seed: { reports: Report[]; inventory: InventoryItem[] } = buildSeed()) {
    this.reports = structuredClone(seed.reports);
    this.inventory = structuredClone(seed.inventory);
  }

  async listReports() {
    return structuredClone(this.reports);
  }

  async getReport(id: string) {
    const r = this.reports.find((x) => x.id === id);
    return r ? structuredClone(r) : null;
  }

  async findReportByFingerprint(fingerprint: string) {
    const r = this.reports.find((x) => x.fingerprint === fingerprint);
    return r ? structuredClone(r) : null;
  }

  async createReport(record: NewReportRecord) {
    const existing = this.reports.find((x) => x.fingerprint === record.fingerprint);
    if (existing) throw new ExactDuplicateError(existing.id);
    const id = randomUUID();
    const report: Report = {
      ...record,
      id,
      createdAt: new Date().toISOString(),
      needs: record.needs.map((n) => ({ ...n, id: randomUUID(), reportId: id })),
    };
    this.reports.push(report);
    this.persist();
    return structuredClone(report);
  }

  async importReport(report: Report) {
    if (this.reports.some((x) => x.id === report.id)) throw new Error("Laporan sudah ada");
    this.reports.push(structuredClone(report));
    this.persist();
    return structuredClone(report);
  }

  async updateReport(id: string, record: ReportUpdateRecord) {
    const idx = this.reports.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error("Laporan tidak ditemukan");
    const updated: Report = {
      ...this.reports[idx],
      ...record,
      needs: record.needs.map((n) => ({ ...n, id: randomUUID(), reportId: id })),
    };
    this.reports[idx] = updated;
    this.persist();
    return structuredClone(updated);
  }

  async setFollowUp(id: string, followUp: FollowUp | null) {
    const idx = this.reports.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error("Laporan tidak ditemukan");
    this.reports[idx] = { ...this.reports[idx], followUp };
    this.persist();
    return structuredClone(this.reports[idx]);
  }

  async listInventory() {
    return structuredClone(this.inventory);
  }

  async upsertInventory(record: InventoryRecord) {
    if (!Number.isFinite(record.availableQuantity) || record.availableQuantity < 0) {
      throw new Error("Stok tidak boleh negatif");
    }
    const idx = this.inventory.findIndex(
      (x) => x.area === record.area && x.item === record.item && x.unit === record.unit,
    );
    if (idx >= 0) {
      this.inventory[idx] = { ...this.inventory[idx], ...record };
      this.persist();
      return structuredClone(this.inventory[idx]);
    }
    const created: InventoryItem = { ...record, id: randomUUID() };
    this.inventory.push(created);
    this.persist();
    return structuredClone(created);
  }

  /** Hook penyimpanan; no-op untuk repository in-memory murni. */
  protected persist(): void {}
}
