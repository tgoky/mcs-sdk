CREATE TABLE "rep_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"severity_score" integer NOT NULL,
	"summary" text NOT NULL,
	"contributing_findings" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"declared_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "rep_reddit_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"external_mention_id" text NOT NULL,
	"subreddit" text NOT NULL,
	"author" text,
	"permalink" text NOT NULL,
	"mention_text" text NOT NULL,
	"published_at" timestamp,
	"sentiment" text NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rep_trustpilot_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"external_review_id" text NOT NULL,
	"reviewer_name" text,
	"rating" integer NOT NULL,
	"review_text" text NOT NULL,
	"published_at" timestamp,
	"sentiment" text NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rep_incidents" ADD CONSTRAINT "rep_incidents_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rep_reddit_mentions" ADD CONSTRAINT "rep_reddit_mentions_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rep_trustpilot_reviews" ADD CONSTRAINT "rep_trustpilot_reviews_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rep_reddit_mention_unique" ON "rep_reddit_mentions" USING btree ("engagement_id","external_mention_id");--> statement-breakpoint
CREATE INDEX "rep_reddit_mentions_engagement_idx" ON "rep_reddit_mentions" USING btree ("engagement_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rep_trustpilot_review_unique" ON "rep_trustpilot_reviews" USING btree ("engagement_id","external_review_id");--> statement-breakpoint
CREATE INDEX "rep_trustpilot_reviews_engagement_idx" ON "rep_trustpilot_reviews" USING btree ("engagement_id","created_at");