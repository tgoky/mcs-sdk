ALTER TABLE "whop_payments" ADD COLUMN "buyer_user_id" text;--> statement-breakpoint
ALTER TABLE "whop_payments" ADD COLUMN "recovery_status" text;--> statement-breakpoint
ALTER TABLE "whop_payments" ADD COLUMN "recovery_message_id" text;--> statement-breakpoint
ALTER TABLE "whop_payments" ADD COLUMN "recovery_error" text;--> statement-breakpoint
ALTER TABLE "whop_payments" ADD COLUMN "recovery_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "whop_payments" ADD COLUMN "recovered_at" timestamp;--> statement-breakpoint
ALTER TABLE "whop_payments" ADD COLUMN "recovered_by_payment_id" text;--> statement-breakpoint
ALTER TABLE "whop_payments" ADD COLUMN "recovered_amount" double precision;--> statement-breakpoint
CREATE INDEX "whop_payments_engagement_membership_idx" ON "whop_payments" USING btree ("engagement_id","membership_id");