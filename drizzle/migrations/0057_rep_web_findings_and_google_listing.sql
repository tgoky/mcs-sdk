-- rep_web_findings and rep_identity_graphs.google_listing were added to
-- schema.ts without a migration. Written to be safe where the schema was
-- already pushed by hand.
CREATE TABLE IF NOT EXISTS "rep_web_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text,
	"text" text NOT NULL,
	"url" text,
	"author" text,
	"rating" integer,
	"owner_answered" boolean,
	"query" text,
	"position" integer,
	"published_at" timestamp,
	"sentiment" text NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rep_identity_graphs" ADD COLUMN IF NOT EXISTS "google_listing" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rep_web_findings" ADD CONSTRAINT "rep_web_findings_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rep_web_finding_unique" ON "rep_web_findings" USING btree ("engagement_id","source","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rep_web_findings_engagement_idx" ON "rep_web_findings" USING btree ("engagement_id","source","created_at");