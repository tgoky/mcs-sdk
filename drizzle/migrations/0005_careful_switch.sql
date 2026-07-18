CREATE TABLE "brief_outcome_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"prospect_email" text,
	"outcome" text NOT NULL,
	"logged_by_slack_user_id" text,
	"logged_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canary_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"adapter_method" text NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"latency_ms" integer,
	"run_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_intelligence_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"recall_bot_id" text NOT NULL,
	"meeting_url" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"transcript_id" text,
	"extracted_objections" jsonb,
	"extraction_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "engagement_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whop_user_id" text NOT NULL,
	"step" text DEFAULT 'offer' NOT NULL,
	"form_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_drafts_whop_user_id_unique" UNIQUE("whop_user_id")
);
--> statement-breakpoint
CREATE TABLE "human_blockers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"skill_name" text NOT NULL,
	"run_id" uuid,
	"blocker_type" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resume_event_name" text DEFAULT 'human_blocker.resolved' NOT NULL,
	"resume_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "metrics_benchmark" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_name" text NOT NULL,
	"bucket" text NOT NULL,
	"sample_size" integer NOT NULL,
	"p25" text NOT NULL,
	"p50" text NOT NULL,
	"p75" text NOT NULL,
	"p90" text NOT NULL,
	"last_computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"action_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	"execution_error" text
);
--> statement-breakpoint
CREATE TABLE "pile_on_send_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"prospect_email" text NOT NULL,
	"sent_via" text NOT NULL,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_adapter_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"platform_kind" text NOT NULL,
	"platform_name" text NOT NULL,
	"website_url" text,
	"docs_url" text,
	"research_summary" jsonb,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_docs_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"docs_url" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_checked_at" timestamp,
	"last_check_status_code" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_docs_links_platform_unique" UNIQUE("platform")
);
--> statement-breakpoint
CREATE TABLE "show_rate_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"prospect_email" text NOT NULL,
	"features" jsonb NOT NULL,
	"predicted_show_probability" integer NOT NULL,
	"model_version" text DEFAULT 'heuristic-v1' NOT NULL,
	"actual_outcome" text,
	"outcome_recorded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"event_source" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"event_kind" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "win_back_send_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"prospect_email" text NOT NULL,
	"sent_via" text NOT NULL,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "owner" text DEFAULT 'mudd_ventures' NOT NULL;--> statement-breakpoint
ALTER TABLE "briefed_calls_log" ADD COLUMN "research_status" text;--> statement-breakpoint
ALTER TABLE "briefed_calls_log" ADD COLUMN "ai_synthesis_status" text;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "casting_choice" text;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "pin_down_script_pack" jsonb;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "pin_down_page_audit" jsonb;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "voice_scrape_artifacts" jsonb;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "discovery_prefill" jsonb;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "pile_on_sms_asset_map" jsonb;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "pile_on_existing_sequence_audit" jsonb;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "existing_audit_audit_result" jsonb;--> statement-breakpoint
ALTER TABLE "win_back_enrollments" ADD COLUMN "fresh_reschedule_link" text;--> statement-breakpoint
ALTER TABLE "win_back_enrollments" ADD COLUMN "exit_reason" text;--> statement-breakpoint
ALTER TABLE "win_back_enrollments" ADD COLUMN "exited_at" timestamp;--> statement-breakpoint
ALTER TABLE "brief_outcome_log" ADD CONSTRAINT "brief_outcome_log_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_intelligence_sessions" ADD CONSTRAINT "conversation_intelligence_sessions_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_blockers" ADD CONSTRAINT "human_blockers_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pile_on_send_log" ADD CONSTRAINT "pile_on_send_log_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_adapter_drafts" ADD CONSTRAINT "platform_adapter_drafts_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_rate_features" ADD CONSTRAINT "show_rate_features_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "win_back_send_log" ADD CONSTRAINT "win_back_send_log_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_source_key_uidx" ON "webhook_events" USING btree ("event_source","idempotency_key");