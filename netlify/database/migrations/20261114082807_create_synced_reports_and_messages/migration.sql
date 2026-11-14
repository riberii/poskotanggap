CREATE TABLE "report_messages" (
	"id" bigserial PRIMARY KEY,
	"report_code" text NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synced_reports" (
	"id" text PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"duplicate" boolean DEFAULT false NOT NULL,
	"arranged_at" timestamp with time zone,
	"arranged_note" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "report_messages_code_idx" ON "report_messages" ("report_code","id");--> statement-breakpoint
ALTER TABLE "report_messages" ADD CONSTRAINT "report_messages_report_code_synced_reports_code_fkey" FOREIGN KEY ("report_code") REFERENCES "synced_reports"("code");