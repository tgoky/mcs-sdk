CREATE TABLE "rep_offensive_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"move" text NOT NULL,
	"item_key" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rep_pitch_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"target" text NOT NULL,
	"beat" text,
	"contact" text,
	"channel" text,
	"fit_notes" text,
	"status" text DEFAULT 'not_contacted' NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rep_reddit_ramp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"confirmed_handle" text,
	"started_at" timestamp,
	"subreddits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activity_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rep_reddit_ramp_engagement_id_unique" UNIQUE("engagement_id")
);
--> statement-breakpoint
ALTER TABLE "rep_offensive_checklist" ADD CONSTRAINT "rep_offensive_checklist_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rep_pitch_targets" ADD CONSTRAINT "rep_pitch_targets_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rep_reddit_ramp" ADD CONSTRAINT "rep_reddit_ramp_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rep_offensive_checklist_unique" ON "rep_offensive_checklist" USING btree ("engagement_id","move","item_key");