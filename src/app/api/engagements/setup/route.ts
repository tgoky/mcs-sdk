import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { storeCredential } from "@/lib/credentials";
import { getSession } from "@/lib/session";
import crypto from "crypto";

export const maxDuration = 30;

/**
 * Persists a new engagement's config and encrypted credentials only.
 * Deliberately does NOT start a run or dispatch the pin-down skill event —
 * that only happens once the client explicitly calls POST
 * /api/pin-down/launch, so there's a real gap between "I filled out the
 * form" and "an agent is now touching real accounts", not just a warning
 * in the confirm-step copy about what a single button click will do.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return new Response("Unauthorized", { status: 401 });
    }
    const whopUserId = session.whopUserId;

    const body = await request.json();
    const {
      engagementId,
      buyerName,
      offerDetails,
      stack,
      topCallQuestions,
      topObjections,
      prospectMeets,
      rawVoiceCorpus,
      credentials,
    } = body;

    if (!engagementId || !buyerName) {
      return new Response("Missing required fields: engagementId, buyerName", { status: 400 });
    }
    if (!stack?.booking_platform || !stack?.email_platform) {
      return new Response("Missing required stack config: booking_platform and email_platform", { status: 400 });
    }

    // ── Email/CRM Platform Meta Flattening ──────────────────────────────
    const finalStack = { ...stack };

    if (finalStack.email_platform_meta) {
      const m = finalStack.email_platform_meta;

      if (finalStack.email_platform === "klaviyo") {
        if (m.target_list_id) finalStack.target_list_id = m.target_list_id;
        if (m.recovery_list_id) finalStack.recovery_list_id = m.recovery_list_id;
      }

      if (finalStack.email_platform === "activecampaign") {
        if (m.target_list_id) finalStack.target_list_id = m.target_list_id;
        if (m.recovery_list_id) finalStack.recovery_list_id = m.recovery_list_id;
        if (m.base_url) finalStack.activecampaign_base_url = m.base_url;
      }

      if (finalStack.email_platform === "mailchimp" || finalStack.email_platform === "convertkit") {
        if (m.target_list_id) finalStack.target_list_id = m.target_list_id;
        if (m.recovery_list_id) finalStack.recovery_list_id = m.recovery_list_id;
      }

      if (finalStack.email_platform === "ghl") {
        finalStack.booking_platform_meta = {
          ...finalStack.booking_platform_meta,
          ...(!finalStack.booking_platform_meta?.location_id && m.location_id && { location_id: m.location_id }),
          ...(m.target_workflow_id && { target_workflow_id: m.target_workflow_id }),
          ...(m.recovery_workflow_id && { recovery_workflow_id: m.recovery_workflow_id }),
        };
      }

      delete finalStack.email_platform_meta;
    }

    finalStack.slack_webhook_url = credentials?.slack_webhook_url ?? finalStack.slack_webhook_url;

    // ── Step 1: Ensure engagement row exists ──
    // CRITICAL: must target engagementId's unique constraint explicitly.
    // Without a target, onConflictDoNothing() falls back to the PRIMARY KEY
    // (the random UUID `id`), which never conflicts — so if the row already
    // exists under its business key, the INSERT throws a unique-constraint
    // violation that the catch block intercepts.
    await db
      .insert(engagements)
      .values({
        id: crypto.randomUUID(),
        engagementId,
        whopUserId,
        buyer: buyerName,
        schemaVersion: "1.0",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: engagements.engagementId });

    // ── Step 2: Store encrypted credentials and update stack in transaction ──
    await db.transaction(async (tx) => {
      if (credentials?.booking) {
        await storeCredential(
          engagementId,
          finalStack.booking_platform,
          `secrets://${engagementId}/${finalStack.booking_platform}_pat`,
          credentials.booking,
          tx
        );
      }
      if (credentials?.email) {
        await storeCredential(
          engagementId,
          finalStack.email_platform,
          `secrets://${engagementId}/${finalStack.email_platform}_key`,
          credentials.email,
          tx
        );
      }
      if (credentials?.hosting) {
        await storeCredential(
          engagementId,
          finalStack.hosting_platform,
          `secrets://${engagementId}/${finalStack.hosting_platform}_key`,
          credentials.hosting,
          tx
        );
      }
      if (credentials?.sms && finalStack.sms_platform && finalStack.sms_platform !== "none") {
        await storeCredential(
          engagementId,
          finalStack.sms_platform,
          `secrets://${engagementId}/${finalStack.sms_platform}_key`,
          credentials.sms,
          tx
        );
      }
      if (
        credentials?.adData &&
        finalStack.ad_data_platform &&
        finalStack.ad_data_platform !== "none" &&
        finalStack.ad_data_platform !== "native_crm"
      ) {
        await storeCredential(
          engagementId,
          finalStack.ad_data_platform,
          `secrets://${engagementId}/${finalStack.ad_data_platform}_key`,
          credentials.adData,
          tx
        );
      }
      if (
        credentials?.videoEngagement &&
        finalStack.video_engagement_platform &&
        finalStack.video_engagement_platform !== "none" &&
        finalStack.video_engagement_platform !== "loom"
      ) {
        await storeCredential(
          engagementId,
          finalStack.video_engagement_platform,
          `secrets://${engagementId}/${finalStack.video_engagement_platform}_key`,
          credentials.videoEngagement,
          tx
        );
      }
      if (credentials?.apollo && finalStack.prospect_research_sources_used?.includes("apollo")) {
        await storeCredential(engagementId, "apollo", `secrets://${engagementId}/apollo_key`, credentials.apollo, tx);
      }
      if (credentials?.pdl && finalStack.prospect_research_sources_used?.includes("pdl")) {
        await storeCredential(engagementId, "pdl", `secrets://${engagementId}/pdl_key`, credentials.pdl, tx);
      }

      // Persist the buyer's raw form submission
      await tx
        .update(engagements)
        .set({
          stack: finalStack,
          offerDetails,
          topCallQuestions: topCallQuestions ?? [],
          topObjections: topObjections ?? [],
          prospectMeets: prospectMeets ?? "founder",
          existingProof: body.existingProof,
          rawVoiceCorpus: rawVoiceCorpus ?? "",
          ...(body.discoveryPrefill ? { discoveryPrefill: body.discoveryPrefill } : {}),
          updatedAt: new Date(),
        })
        .where(eq(engagements.engagementId, engagementId));
    });

    return NextResponse.json({
      success: true,
      engagementId,
      status: "ready_to_launch",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[pin-down setup]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}