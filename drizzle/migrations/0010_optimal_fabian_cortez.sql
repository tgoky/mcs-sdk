CREATE TABLE "credential_vault" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whop_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"ref_key" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"iv" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"health_status" text DEFAULT 'unknown' NOT NULL,
	"last_checked_at" timestamp,
	"last_check_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credentials_refs" ALTER COLUMN "encrypted_value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials_refs" ALTER COLUMN "iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials_refs" ADD COLUMN "vault_id" uuid;--> statement-breakpoint
ALTER TABLE "credentials_refs" ADD CONSTRAINT "credentials_refs_vault_id_credential_vault_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."credential_vault"("id") ON DELETE no action ON UPDATE no action;