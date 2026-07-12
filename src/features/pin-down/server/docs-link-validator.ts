import { db } from "@/lib/db";
import { platformDocsLinks } from "@/models/schema";
import { eq } from "drizzle-orm";

/**
 * Pin-Down recovery gap 9 — HEAD-validated platform docs links.
 *
 * The canonical developer-docs URL for every platform this app integrates
 * with, in one place. Global, not per-engagement — "webflow" means the
 * same docs page regardless of which buyer is asking. Kept as a static
 * seed list rather than something operators edit through the UI: these
 * are the platforms hosting.ts/booking.ts/email.ts actually implement
 * adapters against, so drift here should be a deliberate code change
 * alongside the adapter, not a runtime config surface.
 */
const CANONICAL_DOCS: Record<string, string> = {
  // Booking
  calendly: "https://developer.calendly.com/api-docs",
  cal_com: "https://cal.com/docs/api-reference/v2/introduction",
  ghl_calendar: "https://highlevel.stoplight.io/docs/integrations/",
  oncehub: "https://help.oncehub.com/help/oncehub-api",
  // Hosting
  webflow: "https://developers.webflow.com/data/reference/rest-introduction",
  wordpress: "https://developer.wordpress.org/rest-api/",
  nextjs_vercel: "https://vercel.com/docs/rest-api",
  // Email / CRM
  klaviyo: "https://developers.klaviyo.com/en/reference/api_overview",
  hubspot: "https://developers.hubspot.com/docs/api/overview",
  activecampaign: "https://developers.activecampaign.com/reference/overview",
  convertkit: "https://developers.kit.com/",
  mailchimp: "https://mailchimp.com/developer/marketing/api/",
  ghl: "https://highlevel.stoplight.io/docs/integrations/",
};

/**
 * Ensures every canonical platform has a row, then HEAD-checks each URL
 * and records the outcome. Idempotent — safe to run on every cron tick
 * without needing to diff against a prior state first.
 */
export async function validateAllPlatformDocsLinks(): Promise<{
  checked: number;
  ok: number;
  broken: number;
}> {
  let ok = 0;
  let broken = 0;

  for (const [platform, docsUrl] of Object.entries(CANONICAL_DOCS)) {
    const now = new Date();
    let status: "ok" | "broken" = "broken";
    let statusCode: number | null = null;

    try {
      // HEAD first (cheapest); some docs hosts (notably Stoplight-based
      // ones like GHL's) reject HEAD with a 405 despite the page being
      // perfectly reachable — fall back to a lightweight GET in that case
      // rather than mis-flagging a live page as broken.
      let res = await fetch(docsUrl, { method: "HEAD", redirect: "follow" });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(docsUrl, { method: "GET", redirect: "follow" });
      }
      statusCode = res.status;
      status = res.ok ? "ok" : "broken";
    } catch (e: any) {
      status = "broken";
      console.warn(`[docs-link-validator] ${platform} docs check failed: ${e.message}`);
    }

    if (status === "ok") ok++;
    else broken++;

    const existing = await db
      .select({ id: platformDocsLinks.id })
      .from(platformDocsLinks)
      .where(eq(platformDocsLinks.platform, platform))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(platformDocsLinks)
        .set({ docsUrl, status, lastCheckedAt: now, lastCheckStatusCode: statusCode, updatedAt: now })
        .where(eq(platformDocsLinks.platform, platform));
    } else {
      await db.insert(platformDocsLinks).values({
        platform,
        docsUrl,
        status,
        lastCheckedAt: now,
        lastCheckStatusCode: statusCode,
      });
    }
  }

  return { checked: Object.keys(CANONICAL_DOCS).length, ok, broken };
}
