CREATE TABLE "client_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"week_start" timestamp NOT NULL,
	"blocks" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_metric_snapshots" ADD CONSTRAINT "client_metric_snapshots_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_metric_snapshots_engagement_week_uidx" ON "client_metric_snapshots" USING btree ("engagement_id","week_start");