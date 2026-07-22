import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { storeCredential } from "@/lib/credentials";
import { getSession } from "@/lib/session";
import { startRun, logStep, failRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import crypto from "crypto";

export const maxDuration = 30;

export async function POST(request: Request) {
  const runId = crypto.randomUUID();

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

    // ── Step 1: Pre-seed engagement row FIRST (Satisfies skill_runs Foreign Key) ──
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
      .onConflictDoNothing();

    // ── Step 2: Now start the run in skill_runs ──
    await startRun({
      id: runId,
      engagementId,
      skillName: "pin-down",
      phase: "onboarding_start",
      label: buyerName,
    });
    await logStep(runId, { phase: "credential_storage", status: "running" });

    // ── Step 3: Store encrypted credentials and update stack in transaction ──
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

    await logStep(runId, {
      phase: "credential_storage",
      status: "success",
      detail: credentials?.booking || credentials?.email ? "Credentials stored" : "No credentials supplied",
    });

    // ── Hand off to the async worker ──────────────────────────────────────
    await inngest.send(skillRunExecute.create({ runId, engagementId, skillName: "pin-down" }));

    return NextResponse.json({
      success: true,
      runId,
      engagementId,
      status: "processing",
    });
  } catch (error: any) {
    console.error("[pin-down setup]", error.message);
    await failRun(runId, error).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}