import { bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
  /** Status layanan yang ditetapkan tim untuk pelapor (informasi; tidak memengaruhi hitungan). */
  teamStatus: text("team_status"),
  teamStatusNote: text("team_status_note"),
  teamStatusAt: timestamp("team_status_at", { withTimezone: true }),
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
    attachmentName: text("attachment_name"),
    attachmentMime: text("attachment_mime"),
    attachmentSize: integer("attachment_size"),
    /** Isi lampiran (base64 tanpa awalan data:). Disajikan lewat /api/sync/media/:code/:id. */
    attachmentData: text("attachment_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("report_messages_code_idx").on(t.reportCode, t.id)],
);

/** Riwayat perubahan status (verifikasi/penolakan dari tim dan status layanan). */
export const reportStatusLog = pgTable(
  "report_status_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    reportCode: text("report_code").notNull().references(() => syncedReports.code),
    label: text().notNull(),
    note: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("report_status_log_code_idx").on(t.reportCode, t.id)],
);
