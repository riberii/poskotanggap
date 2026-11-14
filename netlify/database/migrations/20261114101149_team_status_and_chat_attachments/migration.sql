CREATE TABLE "report_status_log" (
	"id" bigserial PRIMARY KEY,
	"report_code" text NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_messages" ADD COLUMN "attachment_name" text;--> statement-breakpoint
ALTER TABLE "report_messages" ADD COLUMN "attachment_mime" text;--> statement-breakpoint
ALTER TABLE "report_messages" ADD COLUMN "attachment_size" integer;--> statement-breakpoint
ALTER TABLE "report_messages" ADD COLUMN "attachment_data" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "team_status" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "team_status_note" text;--> statement-breakpoint
ALTER TABLE "synced_reports" ADD COLUMN "team_status_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "report_status_log_code_idx" ON "report_status_log" ("report_code","id");--> statement-breakpoint
ALTER TABLE "report_status_log" ADD CONSTRAINT "report_status_log_report_code_synced_reports_code_fkey" FOREIGN KEY ("report_code") REFERENCES "synced_reports"("code");