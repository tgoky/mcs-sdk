CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"trigger" text NOT NULL,
	"ref_id" text NOT NULL,
	"person_name" text,
	"email" text,
	"phone" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"detail" text,
	"channel" text,
	"message_log_id" uuid,
	"send_at" timestamp NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_trigger_uidx" ON "review_requests" USING btree ("engagement_id","trigger","ref_id");--> statement-breakpoint
CREATE INDEX "review_requests_engagement_email_idx" ON "review_requests" USING btree ("engagement_id","email");