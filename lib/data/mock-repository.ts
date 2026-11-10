import { randomUUID } from "node:crypto";
import type { InventoryItem, Report } from "@/lib/domain/types";
import {
  ExactDuplicateError,
  type DataRepository,
  type InventoryRecord,
  type NewReportRecord,
  type ReportUpdateRecord,
} from "./repository";
import { buildSeed } from "./seed-data";

/**
 * Repository in-memory berisi DATA SIMULASI. Dipakai bila Supabase belum
 * dikonfigurasi. Data hilang saat server restart dan tidak dibagi antar
 * instance serverless — hanya untuk demo/pengembangan.
 */
export class MockRepository implements DataRepository {
  readonly mode = "mock" as const;
  private reports: Report[];
  private inventory: InventoryItem[];

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
    return structuredClone(updated);
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
      return structuredClone(this.inventory[idx]);
    }
    const created: InventoryItem = { ...record, id: randomUUID() };
    this.inventory.push(created);
    return structuredClone(created);
  }
}
