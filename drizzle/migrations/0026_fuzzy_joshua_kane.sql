CREATE TABLE "client_report_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"period" text NOT NULL,
	"period_key" text NOT NULL,
	"notes_text" text NOT NULL,
	"metrics_snapshot" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_report_notes" ADD CONSTRAINT "client_report_notes_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_report_notes_engagement_period_uidx" ON "client_report_notes" USING btree ("engagement_id","period","period_key");