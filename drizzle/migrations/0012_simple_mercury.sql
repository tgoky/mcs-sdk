ALTER TABLE "audit_runs_log" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_runs_log" ADD COLUMN "report_markdown" text;--> statement-breakpoint
ALTER TABLE "briefed_calls_log" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "briefed_calls_log" ADD COLUMN "brief_text" text;--> statement-breakpoint
ALTER TABLE "pile_on_send_log" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "pile_on_send_log" ADD COLUMN "personalized_intro" text;--> statement-breakpoint
ALTER TABLE "win_back_enrollments" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "win_back_send_log" ADD COLUMN "personalized_opening" text;