CREATE TABLE "sms_opt_outs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"phone_key" text NOT NULL,
	"opted_out_at" timestamp DEFAULT now() NOT NULL,
	"opted_in_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sms_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"from_phone" text NOT NULL,
	"to_phone" text,
	"body" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"prospect_email" text,
	"prospect_name" text,
	"booking_id" text,
	"intent" text,
	"confidence" integer,
	"classified_by" text,
	"routed_to_queue" boolean DEFAULT false NOT NULL,
	"queue_resolved_at" timestamp,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "sms_opt_outs" ADD CONSTRAINT "sms_opt_outs_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_replies" ADD CONSTRAINT "sms_replies_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_opt_outs_engagement_phone_uidx" ON "sms_opt_outs" USING btree ("engagement_id","phone_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_replies_engagement_message_uidx" ON "sms_replies" USING btree ("engagement_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "sms_replies_engagement_received_idx" ON "sms_replies" USING btree ("engagement_id","received_at");