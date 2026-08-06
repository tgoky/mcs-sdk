ALTER TABLE "brief_outcome_log" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "briefed_calls_log" ADD COLUMN "prospect_email" text;--> statement-breakpoint
ALTER TABLE "briefed_calls_log" ADD COLUMN "prospect_phone" text;--> statement-breakpoint
ALTER TABLE "conversation_intelligence_sessions" ADD COLUMN "sub_code" text;--> statement-breakpoint
ALTER TABLE "win_back_enrollments" ADD COLUMN "source_booking_id" text;