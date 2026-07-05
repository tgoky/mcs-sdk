import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { storeCredential } from "@/lib/credentials";
import { getSession } from "@/lib/session";
import { startRun, logStep, failRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import crypto from "crypto";

// Generous but bounded safety net — this route itself should now finish in
// well under a second (a few DB writes + AES encryption, no network calls
// to Claude/Calendly/Vercel), but 30s of headroom costs nothing and guards
// against an unexpectedly slow DB round trip without masking a genuine hang
// the way the old unbounded synchronous version did.
export const maxDuration = 30;

/**
 * Pin-down onboarding entrypoint.
 *
 * Used to do everything inline here — a real Claude call for voice
 * extraction, a hosting-platform deploy, up to 3 round trips to the
 * booking platform's API — all before ever sending a response. On a real
 * account with a real Calendly key that routinely ran past whatever
 * duration the serverless platform allows, which killed the function
 * mid-flight: the client saw a generic "Failed to fetch" with no
 * information, and the skill_runs row (already showing "running" from the
 * early startRun() call) was stuck there forever, because the code that
 * would've called finishRun() never got the chance to run. Worse, if the
 * kill landed before webhook registration completed, the booking platform
 * webhook was never actually registered — so a prospect booking a call
 * afterward triggered nothing at all, silently.
 *
 * This route now only does the fast, synchronous part: validate input,
 * encrypt and store credentials, persist the buyer's raw form submission
 * onto the engagement row, and hand off to the same Inngest-backed worker
 * every other skill (pile-on, win-back, pre-call-read, leak-map) already
 * uses — see src/features/pin-down/server/onboarding-service.ts and
 * src/inngest/skill.ts. The heavy lifting happens there instead, immune to
 * this request's timeout entirely.
 *
 * The client no longer gets confirmationPageUrl/pasteReadyHtml back
 * synchronously — it polls GET /api/skill-runs/[runId] until the run
 * resolves, then fetches GET /api/engagements/[id] for the final result.
 * See the submit handler in src/app/dashboard/engagements/new/page.tsx.
 */
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
    // Pure JS, no network calls — stays here rather than moving to the
    // worker, since it's not a source of latency. See onboarding-service.ts
    // for why the *discovery* calls (which DO hit external APIs) moved.
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

    // ── Pre-seed engagement row (satisfies skill_runs FK) ────────────────
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

    await startRun({
      id: runId,
      engagementId,
      skillName: "pin-down",
      phase: "onboarding_start",
      label: buyerName,
    });

    // ── Store credentials (fast: AES encryption + DB insert, no network) ─
    await logStep(runId, { phase: "credential_storage", status: "running" });
    if (credentials?.booking) {
      await storeCredential(engagementId, finalStack.booking_platform, `secrets://${engagementId}/${finalStack.booking_platform}_pat`, credentials.booking);
    }
    if (credentials?.email) {
      await storeCredential(engagementId, finalStack.email_platform, `secrets://${engagementId}/${finalStack.email_platform}_key`, credentials.email);
    }
    if (credentials?.hosting) {
      await storeCredential(engagementId, finalStack.hosting_platform, `secrets://${engagementId}/${finalStack.hosting_platform}_key`, credentials.hosting);
    }
    await logStep(runId, {
      phase: "credential_storage",
      status: "success",
      detail: credentials?.booking || credentials?.email ? "Credentials stored" : "No credentials supplied",
    });

    // ── Persist the buyer's raw form submission ──────────────────────────
    // Everything the worker needs to pick this up from here: the stack
    // (pre-discovery — the worker enriches it further), offer details,
    // call questions, and the voice corpus (not shipped through the
    // Inngest event payload; see onboarding-service.ts for why).
    await db
      .update(engagements)
      .set({
        stack: finalStack,
        offerDetails,
        topCallQuestions: topCallQuestions ?? [],
        topObjections: topObjections ?? [],
        prospectMeets: prospectMeets ?? "founder",
        existingProof: body.existingProof,
        rawVoiceCorpus: rawVoiceCorpus ?? "",
        updatedAt: new Date(),
      })
      .where(eq(engagements.engagementId, engagementId));

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
