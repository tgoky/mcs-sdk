ALTER TABLE "sequence_message_log" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "sequence_message_log" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "sequence_message_log" ADD COLUMN "delivery_status" text;--> statement-breakpoint
ALTER TABLE "sequence_message_log" ADD COLUMN "delivery_error" text;--> statement-breakpoint
ALTER TABLE "sequence_message_log" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "sequence_message_log" ADD COLUMN "delivery_updated_at" timestamp;--> statement-breakpoint
CREATE INDEX "sequence_message_log_provider_message_idx" ON "sequence_message_log" USING btree ("engagement_id","provider_message_id");