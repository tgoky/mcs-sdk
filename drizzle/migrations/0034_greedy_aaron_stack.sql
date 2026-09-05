CREATE TABLE "rep_twitter_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"external_mention_id" text NOT NULL,
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
ALTER TABLE "rep_twitter_mentions" ADD CONSTRAINT "rep_twitter_mentions_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rep_twitter_mention_unique" ON "rep_twitter_mentions" USING btree ("engagement_id","external_mention_id");--> statement-breakpoint
CREATE INDEX "rep_twitter_mentions_engagement_idx" ON "rep_twitter_mentions" USING btree ("engagement_id","created_at");