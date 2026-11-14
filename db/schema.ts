import { bigserial, boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Laporan yang disinkronkan lintas perangkat. `payload` = laporan seperti dikirim pelapor
 * (sudah disanitasi server: selalu menunggu review). Status/tindak lanjut hanya dari tim.
 */
export const syncedReports = pgTable("synced_reports", {
  id: text().primaryKey(),
  code: text().notNull().unique(),
  payload: jsonb().notNull(),
  status: text().notNull().default("pending_review"),
  duplicate: boolean().notNull().default(false),
  arrangedAt: timestamp("arranged_at", { withTimezone: true }),
  arrangedNote: text("arranged_note"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportMessages = pgTable(
  "report_messages",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    reportCode: text("report_code").notNull().references(() => syncedReports.code),
    sender: text().notNull(),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("report_messages_code_idx").on(t.reportCode, t.id)],
);
