CREATE TABLE "booking_roster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"external_call_id" text NOT NULL,
	"prospect_name" text,
	"prospect_email" text,
	"prospect_phone" text,
	"call_time" timestamp NOT NULL,
	"call_end_time" timestamp,
	"meeting_url" text,
	"booking_platform" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_roster" ADD CONSTRAINT "booking_roster_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_roster_engagement_call_uidx" ON "booking_roster" USING btree ("engagement_id","external_call_id");--> statement-breakpoint
CREATE INDEX "booking_roster_engagement_call_time_idx" ON "booking_roster" USING btree ("engagement_id","call_time");