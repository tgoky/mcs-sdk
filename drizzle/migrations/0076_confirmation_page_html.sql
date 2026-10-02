ALTER TABLE "engagements" ADD COLUMN "confirmation_page_html" text;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "confirmation_page_built_at" timestamp;--> statement-breakpoint
-- Backfill: where the last build was handed over as a full HTML document
-- (Lovable, "any website", Vercel), that document is the page. The iframe
-- snippets used for Webflow/WordPress/HighLevel aren't, so those wait for
-- their next rebuild.
UPDATE "engagements"
SET "confirmation_page_html" = "paste_ready_html",
    "confirmation_page_built_at" = "updated_at"
WHERE "confirmation_page_html" IS NULL
  AND "paste_ready_html" IS NOT NULL
  AND lower(left(ltrim("paste_ready_html"), 15)) = '<!doctype html>';
