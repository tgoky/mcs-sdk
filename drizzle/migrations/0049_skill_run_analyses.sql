CREATE TABLE "skill_run_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"stats_snapshot" jsonb NOT NULL,
	"narrative" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_run_analyses" ADD CONSTRAINT "skill_run_analyses_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;