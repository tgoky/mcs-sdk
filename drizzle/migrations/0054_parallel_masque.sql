CREATE TABLE "esp_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"platform" text NOT NULL,
	"event_type" text NOT NULL,
	"prospect_email" text,
	"occurred_at" timestamp,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "esp_delivery_events" ADD CONSTRAINT "esp_delivery_events_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "esp_delivery_events_engagement_idx" ON "esp_delivery_events" USING btree ("engagement_id","received_at");