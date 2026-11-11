/**
 * Menghasilkan supabase/seed.sql dari data simulasi di lib/data/seed-data.ts,
 * agar fingerprint di database sama persis dengan hasil normalisasi TypeScript.
 * Jalankan: npm run seed:sql
 */
import { writeFileSync } from "node:fs";
import { buildSeed } from "../lib/data/seed-data";

const q = (v: unknown): string =>
  v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;

const { reports, inventory } = buildSeed();
const lines: string[] = [
  "-- DATA SIMULASI — dihasilkan oleh scripts/generate-seed-sql.ts. Jangan edit manual.",
  "-- Semua nama tempat dan angka fiktif. Jalankan sebagai admin (SQL Editor) setelah migrasi.",
  "begin;",
];
const ordered = [...reports].sort((a, b) => (a.duplicateOf ? 1 : 0) - (b.duplicateOf ? 1 : 0));
for (const r of ordered) {
  lines.push(
    `insert into public.reports (id, raw_text, submitted_at, incident_type, location_text, normalized_area, status, fingerprint, duplicate_of, extraction_json, created_at, verified_at) values (${[
      q(r.id), q(r.rawText), q(r.submittedAt), q(r.incidentType), q(r.locationText), q(r.normalizedArea),
      q(r.status), q(r.fingerprint), q(r.duplicateOf), `${q(JSON.stringify(r.extraction))}::jsonb`, q(r.createdAt), q(r.verifiedAt),
    ].join(", ")}) on conflict (id) do nothing;`,
  );
  for (const n of r.needs) {
    lines.push(
      `insert into public.report_needs (id, report_id, item, quantity, unit, quantity_basis, evidence_quote, verified) values (${[
        q(n.id), q(n.reportId), q(n.item), n.quantity ?? "null", q(n.unit), q(n.quantityBasis), q(n.evidenceQuote), String(n.verified),
      ].join(", ")}) on conflict (id) do nothing;`,
    );
  }
}
for (const i of inventory) {
  lines.push(
    `insert into public.inventory (id, item, area, unit, available_quantity, updated_at) values (${[
      q(i.id), q(i.item), q(i.area), q(i.unit), i.availableQuantity, q(i.updatedAt),
    ].join(", ")}) on conflict (area, item, unit) do nothing;`,
  );
}
lines.push("commit;", "");
writeFileSync(new URL("../supabase/seed.sql", import.meta.url), lines.join("\n"));
console.log(`seed.sql: ${reports.length} laporan, ${inventory.length} stok (simulasi)`);
