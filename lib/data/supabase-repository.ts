import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryItem, Report, ReportNeed } from "@/lib/domain/types";
import {
  ExactDuplicateError,
  type DataRepository,
  type InventoryRecord,
  type NeedRecord,
  type NewReportRecord,
  type ReportUpdateRecord,
} from "./repository";

/* Baris database (snake_case) -> tipe domain (camelCase). */

interface NeedRow {
  id: string;
  report_id: string;
  item: string;
  quantity: number | string | null;
  unit: ReportNeed["unit"];
  quantity_basis: ReportNeed["quantityBasis"];
  evidence_quote: string | null;
  verified: boolean;
}

interface ReportRow {
  id: string;
  raw_text: string;
  submitted_at: string;
  incident_type: Report["incidentType"];
  location_text: string | null;
  normalized_area: string | null;
  status: Report["status"];
  fingerprint: string;
  duplicate_of: string | null;
  extraction_json: Report["extraction"];
  created_at: string;
  verified_at: string | null;
  report_needs?: NeedRow[];
}

interface InventoryRow {
  id: string;
  item: string;
  area: string;
  unit: InventoryItem["unit"];
  available_quantity: number | string;
  updated_at: string;
}

const REPORT_SELECT = "*, report_needs(*)";

function toNeed(r: NeedRow): ReportNeed {
  return {
    id: r.id,
    reportId: r.report_id,
    item: r.item,
    quantity: r.quantity === null ? null : Number(r.quantity),
    unit: r.unit,
    quantityBasis: r.quantity_basis,
    evidenceQuote: r.evidence_quote,
    verified: r.verified,
  };
}

function toReport(r: ReportRow): Report {
  return {
    id: r.id,
    rawText: r.raw_text,
    submittedAt: r.submitted_at,
    incidentType: r.incident_type,
    locationText: r.location_text,
    normalizedArea: r.normalized_area,
    status: r.status,
    fingerprint: r.fingerprint,
    duplicateOf: r.duplicate_of,
    extraction: r.extraction_json,
    createdAt: r.created_at,
    verifiedAt: r.verified_at,
    needs: (r.report_needs ?? []).map(toNeed),
  };
}

function toInventory(r: InventoryRow): InventoryItem {
  return {
    id: r.id,
    item: r.item,
    area: r.area,
    unit: r.unit,
    availableQuantity: Number(r.available_quantity),
    updatedAt: r.updated_at,
  };
}

function needsPayload(needs: NeedRecord[]) {
  return needs.map((n) => ({
    item: n.item,
    quantity: n.quantity,
    unit: n.unit,
    quantity_basis: n.quantityBasis,
    evidence_quote: n.evidenceQuote,
    verified: n.verified,
  }));
}

export class SupabaseRepository implements DataRepository {
  readonly mode = "supabase" as const;
  constructor(private readonly db: SupabaseClient) {}

  async listReports() {
    const { data, error } = await this.db
      .from("reports")
      .select(REPORT_SELECT)
      .order("submitted_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data as ReportRow[]).map(toReport);
  }

  async getReport(id: string) {
    const { data, error } = await this.db
      .from("reports")
      .select(REPORT_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toReport(data as ReportRow) : null;
  }

  async findReportByFingerprint(fingerprint: string) {
    const { data, error } = await this.db
      .from("reports")
      .select(REPORT_SELECT)
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (error) throw error;
    return data ? toReport(data as ReportRow) : null;
  }

  /** Insert laporan + kebutuhan dalam satu transaksi via fungsi SQL (security invoker). */
  async createReport(record: NewReportRecord) {
    const { data, error } = await this.db.rpc("create_report_with_needs", {
      p_report: {
        raw_text: record.rawText,
        submitted_at: record.submittedAt,
        incident_type: record.incidentType,
        location_text: record.locationText,
        normalized_area: record.normalizedArea,
        status: record.status,
        fingerprint: record.fingerprint,
        duplicate_of: record.duplicateOf,
        extraction_json: record.extraction,
        verified_at: record.verifiedAt,
      },
      p_needs: needsPayload(record.needs),
    });
    if (error) {
      if (error.code === "23505") {
        const existing = await this.findReportByFingerprint(record.fingerprint);
        throw new ExactDuplicateError(existing?.id ?? null);
      }
      throw error;
    }
    const created = await this.getReport(data as string);
    if (!created) throw new Error("Laporan gagal dibaca setelah disimpan");
    return created;
  }

  async updateReport(id: string, record: ReportUpdateRecord) {
    const { error } = await this.db.rpc("update_report_with_needs", {
      p_id: id,
      p_report: {
        incident_type: record.incidentType,
        location_text: record.locationText,
        normalized_area: record.normalizedArea,
        status: record.status,
        duplicate_of: record.duplicateOf,
        verified_at: record.verifiedAt,
      },
      p_needs: needsPayload(record.needs),
    });
    if (error) throw error;
    const updated = await this.getReport(id);
    if (!updated) throw new Error("Laporan tidak ditemukan");
    return updated;
  }

  async listInventory() {
    const { data, error } = await this.db.from("inventory").select("*").order("area");
    if (error) throw error;
    return (data as InventoryRow[]).map(toInventory);
  }

  async upsertInventory(record: InventoryRecord) {
    const { data, error } = await this.db
      .from("inventory")
      .upsert(
        {
          item: record.item,
          area: record.area,
          unit: record.unit,
          available_quantity: record.availableQuantity,
          updated_at: record.updatedAt,
        },
        { onConflict: "area,item,unit" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return toInventory(data as InventoryRow);
  }

  /** true bila user yang sedang login terdaftar di tabel operators. */
  async isCurrentUserOperator(userId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("operators")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }
}
