CREATE TABLE "rep_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"event_type" text NOT NULL,
	"parent_event_id" uuid,
	"payload" jsonb NOT NULL,
	"schema_version" text DEFAULT '1.0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rep_audit_events" ADD CONSTRAINT "rep_audit_events_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rep_audit_events_engagement_idx" ON "rep_audit_events" USING btree ("engagement_id","created_at");