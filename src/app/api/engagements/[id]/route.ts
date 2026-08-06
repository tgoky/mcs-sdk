import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { isValidTagColorId } from "@/lib/engagement-tag-colors";

export const revalidate = 0;

/**
 * Used by the engagements/new setup flow to fetch the final result
 * (confirmationPageUrl, deployment mode, paste-ready HTML if applicable)
 * once its pin-down run finishes — see the polling logic in
 * src/app/dashboard/engagements/new/page.tsx. These fields used to come
 * back synchronously in the POST /api/engagements/setup response; now that
 * setup runs asynchronously via Inngest, the client needs a way to fetch
 * them after the fact.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [row] = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      confirmationPageUrl: engagements.confirmationPageUrl,
      confirmationPageDeployment: engagements.confirmationPageDeployment,
      pasteReadyHtml: engagements.pasteReadyHtml,
      pasteReadyInstructions: engagements.pasteReadyInstructions,
      pinDownScriptPack: engagements.pinDownScriptPack,
      pinDownPageAudit: engagements.pinDownPageAudit,
      pausedAt: engagements.pausedAt,
      pausedReason: engagements.pausedReason,
    })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({ engagement: row });
}

const EDITABLE_BOOKING_PLATFORMS = [
  "calendly",
  "cal_com",
  "ghl_calendar",
  "oncehub",
  "discover_from_docs",
  "unsupported",
] as const;

const EDITABLE_EMAIL_PLATFORMS = [
  "klaviyo",
  "hubspot",
  "activecampaign",
  "ghl",
  "convertkit",
  "mailchimp",
  "smtp",
] as const;

const EDITABLE_HOSTING_PLATFORMS = [
  "webflow",
  "lovable",
  "ghl",
  "wordpress",
  "nextjs_vercel",
  "plain_html",
  "discover_from_docs",
] as const;

const EDITABLE_SMS_PLATFORMS = ["twilio", "ghl_sms", "hubspot_sms", "none"] as const;

const EDITABLE_AD_DATA_PLATFORMS = ["hyros", "native_crm", "google_sheets", "none"] as const;

const EDITABLE_WEBHOOK_MODES = ["webhook", "polling", "none"] as const;

const EDITABLE_CONVERSATION_INTELLIGENCE_PROVIDERS = ["recall_ai", "none"] as const;

const EDITABLE_RECALL_REGIONS = ["us-east-1", "us-west-2", "eu-central-1", "ap-northeast-1"] as const;

// Flat (non-nested) structural IDs a buyer's account might change or that
// might get fat-fingered during onboarding — Klaviyo/Mailchimp/ConvertKit
// list IDs, HubSpot/GHL workflow IDs, ActiveCampaign automation ID + base
// URL, and the HubSpot portal ID used to route inbound-reply webhooks.
// Deliberately plain strings validated the same simple way, not nested
// under a *_meta object, because that's how they're actually stored on
// EngagementStack (see src/models/schema.ts) and read in
// src/lib/platforms/email.ts.
const EDITABLE_FLAT_STRING_FIELDS = [
  "target_list_id",
  "recovery_list_id",
  "recovery_workflow_id",
  "recovery_automation_id",
  "target_workflow_id",
  "activecampaign_base_url",
  "hubspot_portal_id",
] as const;

/**
 * Edits the stack fields that actually cause the "someone fat-fingered
 * onboarding, or the buyer's account structure changed" scenario:
 * booking/hosting/email/sms/ad-data platform choice, each one's
 * platform-specific meta (location IDs, site IDs, list/workflow IDs,
 * etc.), how booking events are received, and the flat ESP structural IDs
 * (target_list_id, recovery_workflow_id, etc.) enrollment code reads
 * directly off the stack. Deliberately NOT a general-purpose "PATCH the
 * whole stack blob" endpoint: accepting an arbitrary merge would let a
 * stray client bug silently overwrite server-managed fields (discovery
 * results, credentials refs, artifact ownership, cadence/policy settings
 * like recovery_window_days) that have nothing to do with what this form
 * edits. Everything else on `stack` is left untouched.
 *
 * Also handles restoring a soft-deleted engagement (`{ restore: true }`) —
 * see DELETE below for why deletion is soft.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const [existing] = await db
      .select({ stack: engagements.stack, deletedAt: engagements.deletedAt })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    if (body.restore === true) {
      if (!existing.deletedAt) {
        return NextResponse.json({ error: "Not deleted." }, { status: 409 });
      }
      await db
        .update(engagements)
        .set({ deletedAt: null, pausedAt: null, pausedReason: null, updatedAt: new Date() })
        .where(eq(engagements.engagementId, id));
      return NextResponse.json({ ok: true });
    }

    // Client rail row edits (buyer name / squircle tag color) — from the
    // "..." menu in client-sidebar-list.tsx. Deliberately a separate branch
    // from the stack-edit path below rather than folded into `incoming`:
    // buyer/tagColor are plain top-level columns, not part of the `stack`
    // jsonb blob, and this way a client rail edit can never accidentally
    // race a concurrent Edit Stack Settings save into the same `stack.set()`
    // call.
    if (body.buyer !== undefined || body.tagColor !== undefined) {
      const rowUpdate: { buyer?: string; tagColor?: string | null; updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (body.buyer !== undefined) {
        const trimmed = typeof body.buyer === "string" ? body.buyer.trim() : "";
        if (!trimmed) {
          return NextResponse.json({ error: "Client name can't be empty." }, { status: 400 });
        }
        if (trimmed.length > 200) {
          return NextResponse.json({ error: "Client name is too long." }, { status: 400 });
        }
        rowUpdate.buyer = trimmed;
      }

      if (body.tagColor !== undefined) {
        if (body.tagColor !== null && !isValidTagColorId(body.tagColor)) {
          return NextResponse.json({ error: `Invalid tagColor: ${body.tagColor}` }, { status: 400 });
        }
        rowUpdate.tagColor = body.tagColor;
      }

      await db.update(engagements).set(rowUpdate).where(eq(engagements.engagementId, id));

      return NextResponse.json({
        ok: true,
        ...(rowUpdate.buyer !== undefined ? { buyer: rowUpdate.buyer } : {}),
        ...(rowUpdate.tagColor !== undefined ? { tagColor: rowUpdate.tagColor } : {}),
      });
    }

    const incoming = body.stack;
    if (!incoming || typeof incoming !== "object") {
      return NextResponse.json({ error: "Missing stack edits." }, { status: 400 });
    }

    if (
      incoming.booking_platform !== undefined &&
      !EDITABLE_BOOKING_PLATFORMS.includes(incoming.booking_platform)
    ) {
      return NextResponse.json({ error: `Invalid booking_platform: ${incoming.booking_platform}` }, { status: 400 });
    }
    if (
      incoming.email_platform !== undefined &&
      incoming.email_platform !== null &&
      !EDITABLE_EMAIL_PLATFORMS.includes(incoming.email_platform)
    ) {
      return NextResponse.json({ error: `Invalid email_platform: ${incoming.email_platform}` }, { status: 400 });
    }
    if (
      incoming.hosting_platform !== undefined &&
      !EDITABLE_HOSTING_PLATFORMS.includes(incoming.hosting_platform)
    ) {
      return NextResponse.json({ error: `Invalid hosting_platform: ${incoming.hosting_platform}` }, { status: 400 });
    }
    if (
      incoming.sms_platform !== undefined &&
      incoming.sms_platform !== null &&
      !EDITABLE_SMS_PLATFORMS.includes(incoming.sms_platform)
    ) {
      return NextResponse.json({ error: `Invalid sms_platform: ${incoming.sms_platform}` }, { status: 400 });
    }
    if (
      incoming.ad_data_platform !== undefined &&
      incoming.ad_data_platform !== null &&
      !EDITABLE_AD_DATA_PLATFORMS.includes(incoming.ad_data_platform)
    ) {
      return NextResponse.json({ error: `Invalid ad_data_platform: ${incoming.ad_data_platform}` }, { status: 400 });
    }
    if (
      incoming.webhook_receiver_mode !== undefined &&
      incoming.webhook_receiver_mode !== null &&
      !EDITABLE_WEBHOOK_MODES.includes(incoming.webhook_receiver_mode)
    ) {
      return NextResponse.json({ error: `Invalid webhook_receiver_mode: ${incoming.webhook_receiver_mode}` }, { status: 400 });
    }
    if (
      incoming.conversation_intelligence_provider !== undefined &&
      incoming.conversation_intelligence_provider !== null &&
      !EDITABLE_CONVERSATION_INTELLIGENCE_PROVIDERS.includes(incoming.conversation_intelligence_provider)
    ) {
      return NextResponse.json(
        { error: `Invalid conversation_intelligence_provider: ${incoming.conversation_intelligence_provider}` },
        { status: 400 }
      );
    }
    if (incoming.conversation_intelligence_meta !== undefined) {
      if (typeof incoming.conversation_intelligence_meta !== "object" || incoming.conversation_intelligence_meta === null) {
        return NextResponse.json({ error: "conversation_intelligence_meta must be an object." }, { status: 400 });
      }
      const recallRegion = incoming.conversation_intelligence_meta.recall_region;
      if (recallRegion !== undefined && recallRegion !== "" && !EDITABLE_RECALL_REGIONS.includes(recallRegion)) {
        return NextResponse.json({ error: `Invalid recall_region: ${recallRegion}` }, { status: 400 });
      }
      for (const key of ["recall_bot_name", "recall_webhook_signing_secret"] as const) {
        const v = incoming.conversation_intelligence_meta[key];
        if (v !== undefined && typeof v !== "string") {
          return NextResponse.json({ error: `${key} must be a string.` }, { status: 400 });
        }
      }
    }
    if (incoming.booking_platform_meta !== undefined && typeof incoming.booking_platform_meta !== "object") {
      return NextResponse.json({ error: "booking_platform_meta must be an object." }, { status: 400 });
    }
    if (incoming.hosting_platform_meta !== undefined && typeof incoming.hosting_platform_meta !== "object") {
      return NextResponse.json({ error: "hosting_platform_meta must be an object." }, { status: 400 });
    }
    if (incoming.sms_platform_meta !== undefined && typeof incoming.sms_platform_meta !== "object") {
      return NextResponse.json({ error: "sms_platform_meta must be an object." }, { status: 400 });
    }
    if (incoming.ad_data_platform_meta !== undefined && typeof incoming.ad_data_platform_meta !== "object") {
      return NextResponse.json({ error: "ad_data_platform_meta must be an object." }, { status: 400 });
    }
    for (const field of EDITABLE_FLAT_STRING_FIELDS) {
      if (incoming[field] !== undefined && incoming[field] !== null && typeof incoming[field] !== "string") {
        return NextResponse.json({ error: `${field} must be a string.` }, { status: 400 });
      }
    }

    const currentStack = (existing.stack as EngagementStack | null) ?? ({} as EngagementStack);
    const nextStack: EngagementStack = {
      ...currentStack,
      ...(incoming.booking_platform !== undefined ? { booking_platform: incoming.booking_platform } : {}),
      ...(incoming.email_platform !== undefined ? { email_platform: incoming.email_platform } : {}),
      ...(incoming.hosting_platform !== undefined ? { hosting_platform: incoming.hosting_platform } : {}),
      ...(incoming.sms_platform !== undefined ? { sms_platform: incoming.sms_platform } : {}),
      ...(incoming.ad_data_platform !== undefined ? { ad_data_platform: incoming.ad_data_platform } : {}),
      ...(incoming.webhook_receiver_mode !== undefined ? { webhook_receiver_mode: incoming.webhook_receiver_mode } : {}),
      ...(incoming.conversation_intelligence_provider !== undefined
        ? { conversation_intelligence_provider: incoming.conversation_intelligence_provider }
        : {}),
      ...(incoming.conversation_intelligence_meta !== undefined
        ? { conversation_intelligence_meta: { ...currentStack.conversation_intelligence_meta, ...incoming.conversation_intelligence_meta } }
        : {}),
      ...(incoming.booking_platform_meta !== undefined
        ? { booking_platform_meta: { ...currentStack.booking_platform_meta, ...incoming.booking_platform_meta } }
        : {}),
      ...(incoming.hosting_platform_meta !== undefined
        ? { hosting_platform_meta: { ...currentStack.hosting_platform_meta, ...incoming.hosting_platform_meta } }
        : {}),
      ...(incoming.sms_platform_meta !== undefined
        ? { sms_platform_meta: { ...currentStack.sms_platform_meta, ...incoming.sms_platform_meta } }
        : {}),
      ...(incoming.ad_data_platform_meta !== undefined
        ? { ad_data_platform_meta: { ...currentStack.ad_data_platform_meta, ...incoming.ad_data_platform_meta } }
        : {}),
      ...Object.fromEntries(
        EDITABLE_FLAT_STRING_FIELDS
          .filter((f) => incoming[f] !== undefined)
          .map((f) => [f, incoming[f]])
      ),
    };

    await db
      .update(engagements)
      .set({ stack: nextStack, updatedAt: new Date() })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true, stack: nextStack });
  } catch (err) {
    console.error("[engagements/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update engagement." }, { status: 500 });
  }
}

/**
 * Soft delete only — sets deletedAt (and pausedAt, so every cron's
 * existing isEngagementPaused check skips it immediately as a second,
 * independent guarantee beyond the deletedAt filters on list queries).
 * Never a hard DELETE FROM: every engagement-scoped table's FK constraint
 * is ON DELETE NO ACTION (see drizzle/migrations/0000_bizarre_quasar.sql
 * onward), so a literal delete would throw a foreign-key violation the
 * instant this engagement had so much as one skill run or stored
 * credential — which is to say, always, in practice. Reversible via
 * PATCH { restore: true } for exactly that reason: this is meant to
 * recover from an onboarding mistake, not to be a point of no return.
 * Requires the buyer's name as a confirmation echo — belt-and-suspenders
 * under whatever confirm step the UI already has, since this shouldn't be
 * triggerable by a stray retry or an unguarded API call.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const confirmBuyerName = typeof body?.confirmBuyerName === "string" ? body.confirmBuyerName.trim() : "";

    const [existing] = await db
      .select({ buyer: engagements.buyer, deletedAt: engagements.deletedAt })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }
    if (existing.deletedAt) {
      return NextResponse.json({ error: "Already deleted." }, { status: 409 });
    }
    if (confirmBuyerName !== existing.buyer) {
      return NextResponse.json(
        { error: "Confirmation text didn't match the client name." },
        { status: 400 }
      );
    }

    const now = new Date();
    await db
      .update(engagements)
      .set({ deletedAt: now, pausedAt: now, pausedReason: "Deleted", updatedAt: now })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id] DELETE]", err);
    return NextResponse.json({ error: "Failed to delete engagement." }, { status: 500 });
  }
}
