import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { credentialsRefs, engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { CalendlyClient, CalComClient, GHLCalendarClient } from "@/lib/platforms/booking";
import { MailchimpClient, ConvertKitClient, SMTPClient, parseSmtpCredential } from "@/lib/platforms/email";
import { TwilioClient } from "@/lib/platforms/sms";
import { HyrosClient } from "@/lib/platforms/ad-data";
import { getSession } from "@/lib/session";
import {
  checkInstantlyCredential,
  checkSmartleadCredential,
  checkLemlistCredential,
  checkReplyIoCredential,
  checkApifyCredential,
} from "@/features/cold-open/server/credential-check";
import { checkWhopBotApiKeyCredential } from "@/lib/whop-agent/probe";

/**
 * Same verified-endpoint set as runCredentialHealthCheck() in
 * src/features/notifications/server/credential-health.ts — see the
 * comment there for why this list isn't just "every provider we support."
 * Previously missing ghl_calendar, whop_bot_api_key, twilio, and hyros
 * relative to that cron's own list — closed here so the manual "test now"
 * button and the automatic daily check agree on what's testable (see
 * credential-test-providers.ts's own comment).
 *
 * ghl_calendar and twilio each need a second argument the other
 * validators don't — GHL scopes every request to a location rather than
 * the token alone identifying one, and this app's "twilio credential" is
 * only the Auth Token, with the Account SID stored separately as plain
 * stack metadata (see TwilioClient's constructor and
 * credential-health.ts's own matching comment on its twilio entry). The
 * POST handler below resolves both from the engagement's stack before
 * calling in, mirroring checkSingleCredential's own pattern exactly.
 *
 * Keys here are duplicated as a client-safe list in
 * src/lib/credential-test-providers.ts (TESTABLE_CREDENTIAL_PROVIDERS),
 * which CredentialRow uses to decide whether to show a "Test connection"
 * action at all — keep both in sync when this map changes.
 */
const VALIDATORS: Record<string, (secret: string, ctx: { locationId?: string; twilioAccountSid?: string }) => Promise<void>> = {
  calendly: (token) => new CalendlyClient(token).checkCredentialHealth(),
  cal_com: (token) => new CalComClient(token).checkCredentialHealth(),
  mailchimp: (key) => new MailchimpClient(key).checkCredentialHealth(),
  convertkit: (secret) => new ConvertKitClient(secret).checkCredentialHealth(),
  smtp: (raw) => new SMTPClient(parseSmtpCredential(raw)).checkCredentialHealth(),
  ghl_calendar: (token, ctx) => {
    if (!ctx.locationId?.trim()) {
      throw new Error("No GHL Location ID on file for this engagement yet — set it under Edit stack settings first.");
    }
    return new GHLCalendarClient(token, ctx.locationId).checkCredentialHealth();
  },
  twilio: (authToken, ctx) => {
    if (!ctx.twilioAccountSid?.trim()) {
      throw new Error("No Twilio Account SID on file for this engagement yet — set it under Edit stack settings first.");
    }
    return new TwilioClient(ctx.twilioAccountSid, authToken).checkCredentialHealth();
  },
  whop_bot_api_key: (secret) => checkWhopBotApiKeyCredential(secret),
  hyros: (key) => new HyrosClient(key).checkCredentialHealth(),
  cold_open_instantly: (secret) => checkInstantlyCredential(secret),
  cold_open_smartlead: (secret) => checkSmartleadCredential(secret),
  cold_open_lemlist: (secret) => checkLemlistCredential(secret),
  cold_open_reply_io: (secret) => checkReplyIoCredential(secret),
  cold_open_apify: (secret) => checkApifyCredential(secret),
};

/**
 * "Test connection" button on the credentials page — lets a buyer confirm
 * a key works right after pasting it in, instead of waiting for tomorrow's
 * daily credentialHealthCron to find out for them.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { engagementId, provider } = await request.json();
  if (!engagementId || !provider) {
    return NextResponse.json({ error: "Missing engagementId or provider" }, { status: 400 });
  }

  const validate = VALIDATORS[provider];
  if (!validate) {
    return NextResponse.json(
      { error: `No verified connection test available for "${provider}" yet.` },
      { status: 400 }
    );
  }

  // Ownership check — same pattern as the credentials save route. Also
  // pulls stack for ghl_calendar's locationId / twilio's twilioAccountSid
  // context below; every other provider's validator ignores ctx entirely,
  // so this costs nothing extra for them.
  const [owned] = await db
    .select({ id: engagements.id, stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId)))
    .limit(1);
  if (!owned) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  try {
    const secret = await resolveCredential(engagementId, provider);
    const stack = owned.stack as EngagementStack | null;
    await validate(secret, {
      locationId: stack?.booking_platform_meta?.location_id,
      twilioAccountSid: stack?.sms_platform_meta?.twilio_account_sid,
    });

    await db
      .update(credentialsRefs)
      .set({ healthStatus: "ok", lastCheckedAt: new Date(), lastCheckError: null })
      .where(and(eq(credentialsRefs.engagementId, engagementId), eq(credentialsRefs.provider, provider)));

    return NextResponse.json({ ok: true, status: "ok" });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(credentialsRefs)
      .set({ healthStatus: "invalid", lastCheckedAt: new Date(), lastCheckError: message.slice(0, 500) })
      .where(and(eq(credentialsRefs.engagementId, engagementId), eq(credentialsRefs.provider, provider)));

    return NextResponse.json({ ok: false, status: "invalid", error: message }, { status: 200 });
  }
}
