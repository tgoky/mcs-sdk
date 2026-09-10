CREATE TABLE "cold_open_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"product_identity" jsonb,
	"product_allocation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"icps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sizing_bounds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_required_icps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tracking_defaults" jsonb DEFAULT '{"openTracking":true,"linkTracking":true}'::jsonb NOT NULL,
	"voice_profile" jsonb,
	"subject_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body_variant_pools" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"send_platform" jsonb,
	"campaign_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_push_icps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"daily_send_settings" jsonb,
	"phase_state" jsonb DEFAULT '{"icp_lock":"not_started","voice_capture":"not_started","source_connect":"not_started","send_connect":"not_started","daily_send":"not_started","reply_sort":"not_started","send_report":"not_started"}'::jsonb NOT NULL,
	"last_run_at" timestamp,
	"last_run_summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cold_open_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"run_id" text NOT NULL,
	"email" text NOT NULL,
	"domain" text NOT NULL,
	"company_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"title" text,
	"icp" text,
	"source" text,
	"campaign_id" text NOT NULL,
	"status" text NOT NULL,
	"status_detail" jsonb,
	"pushed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cold_open_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"lead_email" text NOT NULL,
	"campaign_id" text,
	"external_reply_id" text,
	"disposition" text NOT NULL,
	"classification_source" text NOT NULL,
	"raw_body" text NOT NULL,
	"routed_to_queue" boolean DEFAULT false NOT NULL,
	"classified_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cold_open_config" ADD CONSTRAINT "cold_open_config_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cold_open_leads" ADD CONSTRAINT "cold_open_leads_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cold_open_replies" ADD CONSTRAINT "cold_open_replies_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cold_open_config_engagement_unique" ON "cold_open_config" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cold_open_lead_push_unique" ON "cold_open_leads" USING btree ("engagement_id","email","campaign_id");--> statement-breakpoint
CREATE INDEX "cold_open_leads_engagement_idx" ON "cold_open_leads" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "cold_open_replies_engagement_idx" ON "cold_open_replies" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cold_open_replies_external_id_unique" ON "cold_open_replies" USING btree ("engagement_id","external_reply_id");