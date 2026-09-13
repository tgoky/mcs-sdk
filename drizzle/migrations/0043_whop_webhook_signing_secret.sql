ALTER TABLE "whop_webhook_registry" ADD COLUMN "signing_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "whop_webhook_registry" ADD COLUMN "signing_secret_iv" text;--> statement-breakpoint
ALTER TABLE "whop_webhook_registry" ADD COLUMN "signing_secret_key_version" integer;