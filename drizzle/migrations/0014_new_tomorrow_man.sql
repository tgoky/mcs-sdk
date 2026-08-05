CREATE TABLE "sequence_message_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"run_id" uuid,
	"sequence_type" text NOT NULL,
	"enrollment_id" text,
	"booking_id" text,
	"message_id" text NOT NULL,
	"channel" text NOT NULL,
	"prospect_email" text,
	"prospect_phone" text,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sequence_message_log" ADD CONSTRAINT "sequence_message_log_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;