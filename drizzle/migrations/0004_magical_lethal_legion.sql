CREATE TABLE "win_back_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"prospect_email" text NOT NULL,
	"prospect_name" text,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"recovery_window_days" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"lost_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "ad_creative_briefs" jsonb;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "long_term_nurture_asset_map" jsonb;--> statement-breakpoint
ALTER TABLE "win_back_enrollments" ADD CONSTRAINT "win_back_enrollments_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;