CREATE TABLE "client_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" text NOT NULL,
	"source_detail" text,
	"status" text DEFAULT 'suggested' NOT NULL,
	"confidence" integer,
	"evidence" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_facts" ADD CONSTRAINT "client_facts_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_facts_engagement_key_uidx" ON "client_facts" USING btree ("engagement_id","key");