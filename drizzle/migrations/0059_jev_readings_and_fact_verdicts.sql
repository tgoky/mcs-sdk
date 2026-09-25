CREATE TABLE "fact_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"key" text NOT NULL,
	"verdict" text NOT NULL,
	"suggested_value" jsonb,
	"suggested_source" text,
	"suggested_confidence" integer,
	"final_value" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jev_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text,
	"run_id" uuid,
	"purpose" text NOT NULL,
	"model_requested" text NOT NULL,
	"model_served" text,
	"question_count" integer NOT NULL,
	"answers" jsonb,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_in_cents" double precision DEFAULT 0 NOT NULL,
	"latency_ms" integer NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fact_verdicts" ADD CONSTRAINT "fact_verdicts_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jev_readings" ADD CONSTRAINT "jev_readings_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fact_verdicts_key_idx" ON "fact_verdicts" USING btree ("key","suggested_source");--> statement-breakpoint
CREATE INDEX "jev_readings_run_idx" ON "jev_readings" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "jev_readings_created_idx" ON "jev_readings" USING btree ("created_at");