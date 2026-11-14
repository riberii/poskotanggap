CREATE TABLE "announcements" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_agency" text,
	"source_name" text,
	"source_ref" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" bigserial PRIMARY KEY,
	"report_code" text NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"label" text NOT NULL,
	"detail" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporter_blocks" (
	"id" bigserial PRIMARY KEY,
	"reporter_hash" text NOT NULL,
	"report_code" text,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by" text,
	"lift_reason" text
);
--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "reporter_hash" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "is_simulation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "category_group" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "custom_category" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "case_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "priority" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "threat_level" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "assistance_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "appeal_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "appeal_message" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "appeal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "appeal_decision_note" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "appeal_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "assigned_team" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "assigned_responder" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "spam_flags" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "via_emergency_channel" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "announcements_status_idx" ON "announcements" ("status","publish_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" ("id");--> statement-breakpoint
CREATE INDEX "case_events_code_idx" ON "case_events" ("report_code","id");--> statement-breakpoint
CREATE INDEX "reporter_blocks_hash_idx" ON "reporter_blocks" ("reporter_hash");--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_report_code_synced_reports_code_fkey" FOREIGN KEY ("report_code") REFERENCES "synced_reports"("code");
--> statement-breakpoint
-- Data bawaan: SATU laporan dan SATU pengumuman contoh. Keduanya fiktif dan berlabel SIMULASI.
INSERT INTO "synced_reports" ("id", "code", "payload", "status", "submitted_at", "is_simulation", "category_group", "category", "case_status", "priority", "threat_level")
VALUES (
  'a1b2c3d4-0000-4000-8000-000000000001',
  'A1B2C3D4',
  '{"id":"a1b2c3d4-0000-4000-8000-000000000001","rawText":"[SIMULASI - DATA FIKTIF] Banjir contoh di Desa Contoh Makmur. Warga membutuhkan 20 dus air mineral. Laporan ini hanya untuk demonstrasi.","submittedAt":"2026-11-14T00:00:00.000Z","incidentType":"banjir","locationText":"Desa Contoh Makmur (fiktif)","normalizedArea":"desa contoh makmur","status":"pending_review","fingerprint":"5a1000000000000000000000000000000000000000000000000000000000510a","duplicateOf":null,"extraction":null,"createdAt":"2026-11-14T00:00:00.000Z","verifiedAt":null,"needs":[],"attachments":[],"aiInsight":null,"geo":null,"reporter":null,"simulation":true,"category":{"group":"hydromet","code":"flood","custom":null}}'::jsonb,
  'pending_review',
  '2026-11-14T00:00:00.000Z',
  true,
  'hydromet',
  'flood',
  'open',
  'medium',
  'low'
) ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "case_events" ("report_code", "kind", "actor", "label", "detail", "visibility", "created_at")
VALUES
  ('A1B2C3D4', 'created', 'system', 'Laporan simulasi dibuat', 'Contoh bawaan dengan data fiktif untuk demonstrasi alur.', 'public', '2026-11-14T00:00:00.000Z'),
  ('A1B2C3D4', 'status', 'system', 'Status: Dibuka', 'Contoh bawaan (SIMULASI).', 'public', '2026-11-14T00:05:00.000Z');
--> statement-breakpoint
INSERT INTO "announcements" ("id", "title", "body", "category", "source_kind", "status", "published_at", "created_by")
VALUES (
  'sim-default-0001',
  'SIMULASI: Contoh pengumuman peringatan banjir',
  'Ini adalah pengumuman CONTOH dengan data fiktif untuk memperlihatkan tampilan Portal Pelapor. Bukan peringatan nyata dan bukan dari lembaga resmi mana pun. Jika Anda dalam bahaya, hubungi 112.',
  'weather_warning',
  'simulation',
  'published',
  now(),
  'system'
) ON CONFLICT DO NOTHING;
