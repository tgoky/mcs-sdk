import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, credentialsRefs } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { storeCredential, storeVaultCredential, linkEngagementToVault, vaultCredentialBelongsToTenant } from "@/lib/credentials";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
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
    // New clients belong to whichever workspace is currently active — the
    // same resolution every /dashboard page uses, so a client created here
    // shows up in the same workspace the person was looking at when they
    // clicked "Add Client".
    const activeWorkspace = await getActiveWorkspace(whopUserId);

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
      confirmationPageTemplate,
      credentials,
      // { booking?, email?, hosting?, sms?, adData? } — vaultId per slot
      // when the wizard's "Reuse saved" toggle was used instead of
      // pasting a fresh value (see credential-field.tsx and
      // submit-payload.ts). Whichever of credentials.X /
      // credentialVaultLinks.X is present for a slot wins; a slot should
      // never have both, but if it somehow does, the vault link takes
      // priority below.
      credentialVaultLinks,
      // { booking?, email?, hosting?, sms?, adData? } — { label } per slot
      // when the wizard's "save this so I can reuse it for other clients"
      // checkbox was checked in paste mode (see credential-field.tsx and
      // submit-payload.ts's credentialSaveForReuse/saveForReuseEntry).
      // Independent of credentialVaultLinks above: this saves a *new*
      // vault row from a freshly-pasted value, it doesn't link to an
      // existing one.
      credentialSaveForReuse,
    } = body;

    if (!engagementId || !buyerName) {
      return new Response("Missing required fields: engagementId, buyerName", { status: 400 });
    }
    if (!stack?.booking_platform || !stack?.email_platform) {
      return new Response("Missing required stack config: booking_platform and email_platform", { status: 400 });
    }

    // Verify every referenced vault credential belongs to this workspace
    // BEFORE touching the database — fail the whole request up front
    // rather than partially creating an engagement with some providers
    // linked and others rejected mid-transaction.
    if (credentialVaultLinks && typeof credentialVaultLinks === "object") {
      for (const [slot, vaultId] of Object.entries(credentialVaultLinks)) {
        if (!vaultId) continue;
        if (typeof vaultId !== "string") {
          return new Response(`credentialVaultLinks.${slot} must be a string vault id.`, { status: 400 });
        }
        const owned = await vaultCredentialBelongsToTenant(vaultId, activeWorkspace.workspaceId);
        if (!owned) {
          return new Response(`Saved credential for "${slot}" not found or access denied.`, { status: 404 });
        }
      }
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

    // ── Default booking sync to polling, never leave it unset ──────────
    // Previously webhook_receiver_mode only got set later, inside
    // onboarding-service.ts's webhook-registration step, and only if
    // resolveCredential() happened to succeed at that exact moment. Any
    // failure there (or the buyer never getting to /api/pin-down/launch at
    // all) left the field permanently null — which findEngagementsDueForPoll
    // (booking-poller.ts) treats as "never poll this engagement," not
    // "poll it anyway." Setting a safe default the instant the row exists
    // means every booking platform is covered from minute one; GHL/OnceHub
    // stay on polling forever (they have no programmatic webhook
    // registration at all), and Calendly/Cal.com get upgraded to "webhook"
    // moments later once onboarding actually confirms a live subscription.
    if (!finalStack.webhook_receiver_mode && finalStack.booking_platform) {
      finalStack.webhook_receiver_mode = "polling";
      finalStack.webhook_poll_interval_minutes = finalStack.webhook_poll_interval_minutes ?? 25;
      finalStack.webhook_receiver_last_polled_at = new Date().toISOString();
    }

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
        workspaceId: activeWorkspace.workspaceId,
        buyer: buyerName,
        schemaVersion: "1.0",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: engagements.engagementId });

    // ── Step 2: Store encrypted credentials and update stack in transaction ──
    await db.transaction(async (tx) => {
      if (credentialVaultLinks?.booking) {
        await linkEngagementToVault(engagementId, finalStack.booking_platform, credentialVaultLinks.booking, tx);
      } else if (credentials?.booking) {
        await storeCredential(
          engagementId,
          finalStack.booking_platform,
          `secrets://${engagementId}/${finalStack.booking_platform}_pat`,
          credentials.booking,
          tx
        );
      }

      // FIX: submit-payload.ts (the wizard's client-side payload builder)
      // always sets stack.booking_platform_credentials_ref to a
      // deterministic secrets:// path the instant a booking_platform is
      // picked, whether or not credentials.booking was actually filled
      // in and sent — the field name makes it look like a confirmation
      // that a credential exists, but it's really just an echo of the
      // dropdown choice. Every read site that checks
      // stack.booking_platform_credentials_ref (booking-sync-status.ts,
      // nightlyBriefsCron, the sync-mode/booking-calendars routes) is
      // relying on it as that confirmation. The wizard's own client-side
      // validation does currently require a non-empty bookingApiKey
      // before letting anyone reach this request, so this hasn't been
      // reachable via the UI — but this route has no reason to trust a
      // client-supplied value here at all when it can just check the
      // table it's the source of truth for. Never trust the client's
      // ref string directly; only ever set it from what's actually in
      // credentialsRefs after the write above.
      const [bookingCred] = await tx
        .select({ id: credentialsRefs.id })
        .from(credentialsRefs)
        .where(
          and(
            eq(credentialsRefs.engagementId, engagementId),
            eq(credentialsRefs.provider, finalStack.booking_platform)
          )
        )
        .limit(1);
      finalStack.booking_platform_credentials_ref = bookingCred
        ? `secrets://${engagementId}/${finalStack.booking_platform}_pat`
        : undefined;

      if (credentialVaultLinks?.email) {
        await linkEngagementToVault(engagementId, finalStack.email_platform, credentialVaultLinks.email, tx);
      } else if (credentials?.email) {
        await storeCredential(
          engagementId,
          finalStack.email_platform,
          `secrets://${engagementId}/${finalStack.email_platform}_key`,
          credentials.email,
          tx
        );
      }
      if (credentialVaultLinks?.hosting) {
        await linkEngagementToVault(engagementId, finalStack.hosting_platform, credentialVaultLinks.hosting, tx);
      } else if (credentials?.hosting) {
        await storeCredential(
          engagementId,
          finalStack.hosting_platform,
          `secrets://${engagementId}/${finalStack.hosting_platform}_key`,
          credentials.hosting,
          tx
        );
      }
      if (finalStack.sms_platform && finalStack.sms_platform !== "none") {
        if (credentialVaultLinks?.sms) {
          await linkEngagementToVault(engagementId, finalStack.sms_platform, credentialVaultLinks.sms, tx);
        } else if (credentials?.sms) {
          await storeCredential(
            engagementId,
            finalStack.sms_platform,
            `secrets://${engagementId}/${finalStack.sms_platform}_key`,
            credentials.sms,
            tx
          );
        }
      }
      if (
        finalStack.ad_data_platform &&
        finalStack.ad_data_platform !== "none" &&
        finalStack.ad_data_platform !== "native_crm"
      ) {
        if (credentialVaultLinks?.adData) {
          await linkEngagementToVault(engagementId, finalStack.ad_data_platform, credentialVaultLinks.adData, tx);
        } else if (credentials?.adData) {
          await storeCredential(
            engagementId,
            finalStack.ad_data_platform,
            `secrets://${engagementId}/${finalStack.ad_data_platform}_key`,
            credentials.adData,
            tx
          );
        }
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
          ...(confirmationPageTemplate ? { confirmationPageTemplate } : {}),
          ...(body.discoveryPrefill ? { discoveryPrefill: body.discoveryPrefill } : {}),
          updatedAt: new Date(),
        })
        .where(eq(engagements.engagementId, engagementId));
    });

    // ── Step 3: Best-effort "save for reuse" into the credential vault ──
    // Independent of the transaction above on purpose — this never should
    // roll back engagement creation, the same way CredentialRow's identical
    // action post-onboarding (update-credentials-form.tsx) is a separate
    // fetch from the local credential save, not one atomic operation. A
    // failure here is logged, not surfaced as a setup failure: the buyer's
    // engagement is fully set up and usable either way, they'd just need to
    // paste that one key again for their next client instead of reusing it.
    if (credentialSaveForReuse && typeof credentialSaveForReuse === "object") {
      const vaultTargets: Array<{ slot: string; provider: string | undefined; plainValue: string | undefined }> = [
        { slot: "booking", provider: finalStack.booking_platform, plainValue: credentials?.booking },
        { slot: "email", provider: finalStack.email_platform, plainValue: credentials?.email },
        { slot: "hosting", provider: finalStack.hosting_platform, plainValue: credentials?.hosting },
        { slot: "sms", provider: finalStack.sms_platform, plainValue: credentials?.sms },
        { slot: "adData", provider: finalStack.ad_data_platform, plainValue: credentials?.adData },
      ];
      for (const { slot, provider, plainValue } of vaultTargets) {
        const request = credentialSaveForReuse[slot];
        const label = typeof request?.label === "string" ? request.label.trim() : "";
        if (!provider || !plainValue || !label) continue;
        try {
          await storeVaultCredential(
            activeWorkspace.workspaceId,
            whopUserId,
            provider,
            label,
            `secrets://vault/${activeWorkspace.workspaceId}/${provider}/${Date.now()}`,
            plainValue
          );
        } catch (err) {
          console.error(`[pin-down setup] Failed to save "${slot}" credential for reuse:`, err);
        }
      }
    }

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