CREATE TABLE "whop_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"email" text,
	"phone" text,
	"buyer_name" text,
	"membership_id" text,
	"product_title" text,
	"status" text,
	"outcome" text NOT NULL,
	"amount" double precision,
	"currency" text,
	"usd_amount" double precision,
	"refunded_amount" double precision,
	"failure_message" text,
	"next_payment_attempt_at" timestamp,
	"paid_at" timestamp,
	"occurred_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whop_payments" ADD CONSTRAINT "whop_payments_engagement_id_engagements_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whop_payments_engagement_payment_uidx" ON "whop_payments" USING btree ("engagement_id","payment_id");--> statement-breakpoint
CREATE INDEX "whop_payments_engagement_email_idx" ON "whop_payments" USING btree ("engagement_id","email");