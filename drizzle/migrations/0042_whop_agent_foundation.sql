CREATE TABLE "whop_agent_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"credential_type" text DEFAULT 'unknown' NOT NULL,
	"whop_account_id" text,
	"scope_probe_results" jsonb,
	"last_scope_probe_at" timestamp,
	"pinned_version_date" text,
	"circuit_breaker_state" text DEFAULT 'closed' NOT NULL,
	"circuit_breaker_tripped_at" timestamp,
	"circuit_breaker_reason" text,
	"last_successful_call_at" timestamp,
	"disconnected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whop_agent_connections_engagement_id_unique" UNIQUE("engagement_id")
);
--> statement-breakpoint
CREATE TABLE "whop_change_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"event_type" text NOT NULL,
	"changed_fields" jsonb,
	"delta_available" boolean DEFAULT true NOT NULL,
	"material" boolean DEFAULT true NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whop_webhook_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"whop_webhook_id" text NOT NULL,
	"url" text NOT NULL,
	"events" jsonb NOT NULL,
	"created_by_agent" boolean DEFAULT false NOT NULL,
	"api_version" text,
	"api_version_date" text,
	"duplicate_group_key" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"failing_since" timestamp,
	"last_failure_at" timestamp,
	"disabled_at" timestamp,
	"disabled_reason" text,
	"last_delivery_received_at" timestamp,
	"schema_fingerprint" jsonb,
	"schema_fingerprint_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whop_agent_connections" ADD CONSTRAINT "whop_agent_connections_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whop_change_ledger" ADD CONSTRAINT "whop_change_ledger_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whop_webhook_registry" ADD CONSTRAINT "whop_webhook_registry_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whop_change_ledger_engagement_idx" ON "whop_change_ledger" USING btree ("engagement_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whop_webhook_registry_unique" ON "whop_webhook_registry" USING btree ("engagement_id","whop_webhook_id");--> statement-breakpoint
CREATE INDEX "whop_webhook_registry_engagement_idx" ON "whop_webhook_registry" USING btree ("engagement_id");