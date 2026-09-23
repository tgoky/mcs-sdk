// src/features/pin-down/server/confirmation-page-only.ts
//
// Standalone rebuild-and-republish for the Pin-Down confirmation page —
// the missing sibling to voice-extraction-only.ts / script-pack-only.ts /
// ad-briefs-only.ts / page-audit-only.ts. Those four cover every other
// Show Rate Setup deliverable as a re-runnable, on-demand action; the
// actual page build+deploy was the one piece runPinDownOnboarding
// (onboarding-service.ts) only ever ran once, at onboarding, with no way
// to pick it back up after — see that file's own header comment, updated
// alongside this one.
//
// Deliberately does NOT re-run voice extraction (an LLM call), scripts,
// or ad briefs — those already have their own standalone actions and
// this reuses whatever they last wrote to the engagement row. It DOES
// re-run the design scrape, since "the buyer's site changed" is one of
// the two reasons this exists (the other being "the buyer's offer/proof/
// hero video changed" — plain data already on the row).

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { publishConfirmationPage } from "@/lib/platforms/hosting";
import { gateOrExecute } from "@/lib/approval-gate";
import { buildConfirmationPageHtml } from "./templates";
import { scrapeDesignSignal } from "./design-scraper";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export async function runConfirmationPageOnly(
  tenant: any,
  runId: string,
  step: StepTools | undefined,
  ctx?: { heroVideoUrl?: string }
): Promise<void> {
  const summary = emptySummary();
  const run = step ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) : <T,>(_id: string, fn: () => Promise<T>) => fn();
  const engagementId: string = tenant.engagementId;
  const buyerName: string = tenant.buyer;
  const stack: EngagementStack = tenant.stack ?? {};

  try {
    if (stack.existing_confirmation_page_reuse && stack.existing_confirmation_page_url) {
      await logStep(runId, {
        phase: "confirmation_page_deploy",
        status: "skipped",
        detail: "This client is set to keep their existing confirmation page. Nothing to rebuild.",
      });
      summary.openItems.push(
        "Client is configured to keep their existing confirmation page. Switch that off in Edit Stack Settings before rebuilding one."
      );
      await finishRun(runId, { summary });
      return;
    }

    // A caller can pass a fresh video link in the same action that
    // triggers the rebuild ("paste your Loom link, rebuild now") instead
    // of requiring two separate steps; when omitted this just reuses
    // whatever's already on the row.
    const heroVideoUrl: string | undefined = ctx?.heroVideoUrl?.trim() || tenant.heroVideoUrl || undefined;
    if (ctx?.heroVideoUrl?.trim()) {
      await run("save-hero-video-url", async () => {
        await db.update(engagements).set({ heroVideoUrl: ctx.heroVideoUrl!.trim(), updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
      });
    }

    let designSignal: Awaited<ReturnType<typeof scrapeDesignSignal>> = null;
    if (stack.buyer_domain) {
      await logStep(runId, { phase: "design_scrape", status: "running", label: stack.buyer_domain });
      try {
        designSignal = await run("design-scrape", () => scrapeDesignSignal(stack.buyer_domain!));
        await logStep(runId, {
          phase: "design_scrape",
          status: designSignal ? "success" : "skipped",
          detail: designSignal ? `Matched the confirmation page's visual style to ${stack.buyer_domain}.` : `No usable design signal from ${stack.buyer_domain}. Using the template's default look.`,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        await logStep(runId, { phase: "design_scrape", status: "failed", detail: message });
      }
    }

    const pageContent = buildConfirmationPageHtml(
      {
        buyer: buyerName,
        offerDetails: tenant.offerDetails,
        brandVoiceProfile: tenant.brandVoiceProfile,
        topCallQuestions: tenant.topCallQuestions ?? [],
        prospectMeets: tenant.prospectMeets,
        existingProof: tenant.existingProof,
        designSignal: designSignal ?? undefined,
        heroVideoUrl,
        animationsEnabled: tenant.confirmationPageAnimationsEnabled,
      },
      tenant.confirmationPageTemplate
    );

    await logStep(runId, { phase: "confirmation_page_deploy", status: "running" });

    const hostingCredential = stack.hosting_platform ? await resolveCredential(engagementId, stack.hosting_platform).catch(() => null) : null;

    const gated = await gateOrExecute(
      stack,
      engagementId,
      "confirmation_page_deploy",
      { runId, pageContent },
      () => publishConfirmationPage(stack.hosting_platform ?? "", hostingCredential, stack.hosting_platform_meta, pageContent, engagementId)
    );

    if (!gated.executed) {
      await logStep(runId, {
        phase: "confirmation_page_deploy",
        status: "pending_review",
        detail: "Queued for your approval. The rebuilt page hasn't published yet. Approve it from the dashboard queue to go live.",
      });
      summary.openItems.push("Rebuilt confirmation page queued for approval before it publishes.");
      await finishRun(runId, { summary });
      return;
    }

    const deployResult = gated.result;

    if (deployResult.mode === "live") {
      const updatedMeta =
        stack.hosting_platform === "wordpress" && deployResult.resourceId
          ? { ...stack.hosting_platform_meta, wordpress_page_id: deployResult.resourceId as number }
          : stack.hosting_platform === "webflow" && deployResult.resourceId
          ? { ...stack.hosting_platform_meta, webflow_confirmation_item_id: String(deployResult.resourceId) }
          : stack.hosting_platform_meta;

      await run("persist", async () => {
        await db
          .update(engagements)
          .set({
            stack: { ...stack, hosting_platform_meta: updatedMeta },
            confirmationPageUrl: deployResult.url,
            confirmationPageDeployment: { mode: "live", deployedVia: deployResult.deployedVia, lastAttemptedAt: new Date().toISOString() },
            pasteReadyHtml: null,
            pasteReadyInstructions: null,
            updatedAt: new Date(),
          })
          .where(eq(engagements.engagementId, engagementId));
      });

      await logStep(runId, { phase: "confirmation_page_deploy", status: "success", detail: `Live on buyer's ${stack.hosting_platform}: ${deployResult.url}` });
      summary.whatWasAttempted.push(`Rebuilt and republished ${buyerName}'s confirmation page.`);
      summary.whatWorked.push(`Live at ${deployResult.url}.`);
    } else {
      await run("persist", async () => {
        await db
          .update(engagements)
          .set({
            confirmationPageDeployment: { mode: "paste_ready", reason: deployResult.reason, lastAttemptedAt: new Date().toISOString() },
            pasteReadyHtml: deployResult.html,
            pasteReadyInstructions: deployResult.instructions,
            updatedAt: new Date(),
          })
          .where(eq(engagements.engagementId, engagementId));
      });

      await logStep(runId, { phase: "confirmation_page_deploy", status: "failed", detail: deployResult.reason });
      summary.whatFailed.push(`Could not auto-publish the rebuilt page to ${stack.hosting_platform}: ${deployResult.reason}`);
      summary.openItems.push(`Paste-ready HTML ready for ${stack.hosting_platform}. Manual publish required.`);
    }

    await finishRun(runId, { summary });
  } catch (err) {
    await logStep(runId, { phase: "confirmation_page_deploy", status: "failed", detail: err instanceof Error ? err.message : String(err) });
    await failRun(runId, err);
  }
}
