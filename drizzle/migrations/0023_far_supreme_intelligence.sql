ALTER TABLE "workspaces" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "locale" text DEFAULT 'en-US' NOT NULL;