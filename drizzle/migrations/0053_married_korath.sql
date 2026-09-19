ALTER TABLE "briefed_calls_log" ADD COLUMN "person_match_trace" jsonb;--> statement-breakpoint
ALTER TABLE "cold_open_config" ADD COLUMN "report_window_days" integer DEFAULT 7 NOT NULL;