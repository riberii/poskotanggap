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
  /** SHA-256 dari kunci pelapor di perangkatnya. Dipakai untuk "Laporan saya" dan moderasi; tidak pernah dikirim ke klien. */
  reporterHash: text("reporter_hash"),
  isSimulation: boolean("is_simulation").notNull().default(false),
  categoryGroup: text("category_group"),
  category: text(),
  customCategory: text("custom_category"),
  caseStatus: text("case_status").notNull().default("new"),
  priority: text().notNull().default("medium"),
  threatLevel: text("threat_level").notNull().default("none"),
  assistanceStatus: text("assistance_status").notNull().default("none"),
  rejectionReason: text("rejection_reason"),
  appealState: text("appeal_state").notNull().default("none"),
  appealMessage: text("appeal_message"),
  appealAt: timestamp("appeal_at", { withTimezone: true }),
  appealDecisionNote: text("appeal_decision_note"),
  appealDecidedAt: timestamp("appeal_decided_at", { withTimezone: true }),
  assignedTeam: text("assigned_team"),
  assignedResponder: text("assigned_responder"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  spamFlags: jsonb("spam_flags").notNull().default([]),
  viaEmergencyChannel: boolean("via_emergency_channel").notNull().default(false),
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

/** Jejak kasus. visibility "public" tampil ke pelapor; "internal" hanya tim (catatan internal, penugasan). Tidak pernah diubah/dihapus. */
export const caseEvents = pgTable(
  "case_events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    reportCode: text("report_code").notNull().references(() => syncedReports.code),
    kind: text().notNull(),
    actor: text().notNull(),
    label: text().notNull(),
    detail: text(),
    visibility: text().notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("case_events_code_idx").on(t.reportCode, t.id)],
);

export const announcements = pgTable(
  "announcements",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    body: text().notNull(),
    category: text().notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceAgency: text("source_agency"),
    sourceName: text("source_name"),
    sourceRef: text("source_ref"),
    status: text().notNull().default("draft"),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_status_idx").on(t.status, t.publishAt)],
);

export const reporterBlocks = pgTable(
  "reporter_blocks",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    reporterHash: text("reporter_hash").notNull(),
    /** Kode laporan yang menjadi dasar blokir (untuk tampilan tim; bukan identitas pelapor). */
    reportCode: text("report_code"),
    kind: text().notNull(),
    reason: text().notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    liftedBy: text("lifted_by"),
    liftReason: text("lift_reason"),
  },
  (t) => [index("reporter_blocks_hash_idx").on(t.reporterHash)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    actorRole: text("actor_role").notNull(),
    action: text().notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    detail: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.id)],
);
