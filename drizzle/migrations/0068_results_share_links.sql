CREATE TABLE "results_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "results_share_links" ADD CONSTRAINT "results_share_links_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "results_share_links_token_uidx" ON "results_share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "results_share_links_engagement_idx" ON "results_share_links" USING btree ("engagement_id");