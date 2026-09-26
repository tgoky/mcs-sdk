// src/app/api/engagements/[id]/workers/pile-on/enable-with-config/route.ts
//
// EnablePileOnModal's "Quick setup" tab posts here instead of the two-step
// PATCH-then-enable dance — one call, backed by the same
// enablePileOnForEngagement function Teammates chat's enable_pile_on tool
// calls, so the two surfaces can't produce different results.

import { NextResponse } from "next/server";
import { DEFAULT_AT_RISK_THRESHOLD } from "@/lib/at-risk";
import { MAX_HOLDOUT_PERCENT } from "@/lib/reminder-holdout";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { enablePileOnForEngagement } from "@/lib/enable-pile-on";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { showtimeConnectionSuggestions } from "@/lib/derived-suggestions";
import { getClientFact } from "@/lib/client-facts";
import { webhookUrl } from "@/lib/webhook-url-token";
import { TWILIO_INBOUND_PATH } from "@/lib/sms-replies";

export const runtime = "nodejs";

/** The saved SMS / ad-data choices (null while never chosen — "none" is a
 * real choice, not a default) plus what the connected tools suggest. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: engagementId } = await params;
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, engagementId),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }
  const stack = (row.stack as Partial<EngagementStack> | null) ?? {};
  return NextResponse.json({
    smsPlatform: stack.sms_platform ?? null,
    adDataPlatform: stack.ad_data_platform ?? null,
    smsPlatformMeta: {
      twilio_account_sid: stack.sms_platform_meta?.twilio_account_sid ?? "",
      twilio_messaging_service_sid: stack.sms_platform_meta?.twilio_messaging_service_sid ?? "",
      twilio_from_number: stack.sms_platform_meta?.twilio_from_number ?? "",
      // GHL SMS sends from the same location as GHL booking when one is set.
      ghl_location_id: stack.sms_platform_meta?.ghl_location_id ?? stack.booking_platform_meta?.location_id ?? "",
    },
    suggestions: await showtimeConnectionSuggestions(engagementId, stack),
    // Twilio's raw A2P campaign status ("IN_PROGRESS", "VERIFIED", "FAILED").
    twilioCampaignStatus: stack.sms_platform === "twilio" ? ((await getClientFact(engagementId, "smsA2pCampaignStatus"))?.value ?? null) : null,
    // Where the client's Twilio number sends the texts prospects reply
    // with (api/webhooks/twilio-inbound), tokened per client.
    twilioReplyUrl: stack.sms_platform === "twilio" ? webhookUrl(process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin, TWILIO_INBOUND_PATH, engagementId) : null,
    // One extra check-in text for calls that look at risk (lib/at-risk.ts).
    atRiskCheckIn: Boolean(stack.at_risk_check_in),
    atRiskThreshold: stack.at_risk_threshold ?? DEFAULT_AT_RISK_THRESHOLD,
    holdoutPercent: stack.reminder_holdout_percent ?? 0,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await req.json().catch(() => ({}));
    const smsPlatform = typeof body?.smsPlatform === "string" ? body.smsPlatform : undefined;
    const adDataPlatform = typeof body?.adDataPlatform === "string" ? body.adDataPlatform : undefined;
    const rawMeta = body?.smsPlatformMeta && typeof body.smsPlatformMeta === "object" ? body.smsPlatformMeta : {};
    const smsPlatformMeta = {
      twilio_account_sid: typeof rawMeta.twilio_account_sid === "string" ? rawMeta.twilio_account_sid : undefined,
      twilio_messaging_service_sid: typeof rawMeta.twilio_messaging_service_sid === "string" ? rawMeta.twilio_messaging_service_sid : undefined,
      twilio_from_number: typeof rawMeta.twilio_from_number === "string" ? rawMeta.twilio_from_number : undefined,
      ghl_location_id: typeof rawMeta.ghl_location_id === "string" ? rawMeta.ghl_location_id : undefined,
    };

    const result = await enablePileOnForEngagement(session.whopUserId, activeWorkspace.workspaceId, engagementId, {
      smsPlatform,
      adDataPlatform,
      smsPlatformMeta,
    });
    if (!result.ok) {
      const status = result.bridgeHref ? 422 : 400;
      return NextResponse.json(
        { error: result.error, bridgeHref: result.bridgeHref, productId: result.productId, onboardingWorkerName: result.onboardingWorkerName },
        { status }
      );
    }
    // At-risk check-ins, saved once Pile-On itself saved. Optional: older
    // callers don't send these, and leave them as saved.
    if (typeof body?.atRiskCheckIn === "boolean") {
      const threshold = Number(body.atRiskThreshold ?? DEFAULT_AT_RISK_THRESHOLD);
      if (!Number.isFinite(threshold) || threshold < 10 || threshold > 90) return NextResponse.json({ error: "The at-risk level must be between 10% and 90%." }, { status: 400 });
      await patchEngagementStack(engagementId, {
        at_risk_check_in: body.atRiskCheckIn || undefined,
        at_risk_threshold: Math.round(threshold) === DEFAULT_AT_RISK_THRESHOLD ? undefined : Math.round(threshold),
        // A score is needed to act on; turning check-ins on turns scoring on.
        ...(body.atRiskCheckIn ? { show_rate_scoring_enabled: true } : {}),
      });
    }
    if (body?.holdoutPercent !== undefined) {
      const pct = Number(body.holdoutPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > MAX_HOLDOUT_PERCENT) return NextResponse.json({ error: `The holdout must be between 0% and ${MAX_HOLDOUT_PERCENT}%.` }, { status: 400 });
      await patchEngagementStack(engagementId, { reminder_holdout_percent: pct > 0 ? Math.round(pct) : undefined });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
