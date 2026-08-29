CREATE TABLE "rep_identity_graphs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"operator_name" text NOT NULL,
	"operator_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"operator_handles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"operator_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"operator_email_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offerings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"collisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trusted_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"adversarial_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seed_panel_prompts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sole_authority_name" text NOT NULL,
	"crisis_threshold_override" integer,
	"collision_check_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "rep_identity_graphs" ADD CONSTRAINT "rep_identity_graphs_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rep_identity_graph_engagement_unique" ON "rep_identity_graphs" USING btree ("engagement_id");