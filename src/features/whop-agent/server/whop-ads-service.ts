// src/features/whop-agent/server/whop-ads-service.ts
//
// Playbook 5.11. Media generation is async and has no list endpoint
// (Section 5.11: "GET /v1/media (list) returns 404, so media is
// write-then-poll only and a run that loses its media id has no recovery
// path") — the id is persisted immediately on receipt, before polling
// even starts.
import { logStep, finishRun, failRun } from "@/lib/run-log";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { queuePendingAction } from "@/lib/approval-gate";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

interface WhopSocialAccount {
  platform: string;
  scopes?: string[];
  error?: string | null;
}

export interface WhopAdsDraftInput {
  productId: string;
  creativeBrief: string;
  budgetCents: number;
  budgetLevel: "ad_group" | "campaign";
  targeting?: Record<string, unknown>;
}

export interface WhopAdsDraftResult {
  status: "preflight_failed" | "insufficient_balance" | "success" | "failed";
  reason?: string;
  depositUrl?: string;
  mediaId?: string;
  adId?: string;
}

const MEDIA_POLL_MAX_ATTEMPTS = 8;
const MEDIA_POLL_INTERVAL = "30s";

/** Section 5.11's pre-flight — a positive read replacing v2's inference-
 * from-failure. */
async function checkSocialAccountConnected(client: WhopAgentClient): Promise<{ ok: boolean; reason?: string }> {
  const res = await client.request<{ data?: WhopSocialAccount[] }>("social_accounts.list", "/v1/social_accounts", {});
  const meta = res.data?.find((a) => a.platform === "meta" || a.platform === "facebook");
  if (!meta) return { ok: false, reason: "No Meta page connected to this Whop account." };
  if (meta.error) return { ok: false, reason: `Meta page connection has an error: ${meta.error}` };
  if (!meta.scopes?.length) return { ok: false, reason: "Meta page connected but no scopes granted." };
  return { ok: true };
}

/**
 * Playbook 5.11's own executor — runs through Inngest (not synchronously
 * from an API route) because media generation is async and Section
 * 5.11's own poll loop needs durable step.sleep, the same reasoning
 * bridge-manager-service.ts's delivery retries do.
 */
export async function runWhopAdsDraft(engagementId: string, runId: string, input: WhopAdsDraftInput, step: StepTools): Promise<WhopAdsDraftResult> {
  try {
    const client = await WhopAgentClient.forEngagement(engagementId);

    await logStep(runId, { phase: "social_account_preflight", status: "running" });
    const preflight = await step.run("check-social-accounts", () => checkSocialAccountConnected(client));
    if (!preflight.ok) {
      await logStep(runId, { phase: "social_account_preflight", status: "failed", detail: preflight.reason });
      await finishRun(runId, {
        status: "skipped",
        summary: { whatWasAttempted: ["Social account pre-flight"], whatWorked: [], whatFailed: [preflight.reason ?? "unknown"], openItems: ["Connect/fix the Meta page connection, then retry."], decisionsMade: [] },
      });
      return { status: "preflight_failed", reason: preflight.reason };
    }
    await logStep(runId, { phase: "social_account_preflight", status: "success" });

    await logStep(runId, { phase: "media_generate", status: "running", detail: "Media generation cost is surfaced by Whop before the call executes." });
    let mediaId: string;
    try {
      const mediaRes = await step.run("generate-media", () =>
        client.request<{ id: string }>("media.generate", "/v1/media/generate", { method: "POST", body: { brief: input.creativeBrief }, idempotencyKey: `whop-ads-media-generate:${runId}` })
      );
      mediaId = mediaRes.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const depositMatch = message.match(/deposit_url["']?\s*[:=]\s*["']?(https?:\/\/\S+)["']?/i);
      if (depositMatch) {
        await logStep(runId, { phase: "media_generate", status: "failed", detail: `Insufficient balance. Deposit at ${depositMatch[1]}` });
        await finishRun(runId, {
          summary: { whatWasAttempted: ["Media generation"], whatWorked: [], whatFailed: ["Insufficient balance (402)"], openItems: [`Deposit at ${depositMatch[1]}, then retry. No draft was created with missing creative.`], decisionsMade: [] },
        });
        return { status: "insufficient_balance", depositUrl: depositMatch[1] };
      }
      throw err;
    }
    // Persisted immediately — this run's own step log is that persistence
    // (Run History shows it even if everything after this fails).
    await logStep(runId, { phase: "media_generate", status: "success", detail: `Media id: ${mediaId}` });

    await logStep(runId, { phase: "media_poll", status: "running" });
    let mediaReady = false;
    for (let attempt = 0; attempt < MEDIA_POLL_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await step.sleep(`media-poll-wait-${attempt}`, MEDIA_POLL_INTERVAL);
      const mediaStatus = await step.run(`poll-media-${attempt}`, () => client.request<{ status?: string }>("media.get", `/v1/media/${mediaId}`, {}));
      if (mediaStatus.status === "ready" || mediaStatus.status === "completed") {
        mediaReady = true;
        break;
      }
    }
    if (!mediaReady) {
      await logStep(runId, { phase: "media_poll", status: "failed", detail: `Media ${mediaId} not ready after ${MEDIA_POLL_MAX_ATTEMPTS} polls.` });
      await finishRun(runId, {
        summary: { whatWasAttempted: ["Media generation", "Media readiness poll"], whatWorked: [`Media ${mediaId} generated`], whatFailed: ["Media did not become ready in time"], openItems: [`Media id ${mediaId} persisted. Retry the ad create once it's ready; no list endpoint exists to recover it otherwise.`], decisionsMade: [] },
      });
      return { status: "failed", reason: "media_not_ready", mediaId };
    }
    await logStep(runId, { phase: "media_poll", status: "success" });

    await logStep(runId, { phase: "ad_create", status: "running", detail: "Beta-tier feature." });
    const budgetField = input.budgetLevel === "ad_group" ? { ad_group: { budget_cents: input.budgetCents } } : { ad_campaign: { budget_cents: input.budgetCents } };
    const adRes = await step.run("create-ad", () =>
      client.request<{ id: string }>("ads.create", "/v1/ads", {
        method: "POST",
        body: { product_id: input.productId, media_id: mediaId, targeting: input.targeting, ad_campaign: { status: "draft" }, ...budgetField },
        idempotencyKey: `whop-ads-create:${runId}`,
      })
    );
    await logStep(runId, { phase: "ad_create", status: "success", detail: `Ad ${adRes.id} created in draft status.` });

    await finishRun(runId, {
      summary: {
        whatWasAttempted: ["Social account pre-flight", "Media generation", "Media readiness poll", "Ad create (draft)"],
        whatWorked: [`Media ${mediaId} generated`, `Ad ${adRes.id} created as draft`],
        whatFailed: [],
        openItems: ["Flip-to-active is a separate, explicitly confirmed action. This draft does not spend anything yet."],
        decisionsMade: [],
      },
    });

    return { status: "success", mediaId, adId: adRes.id };
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

/** Section 5.11 guardrail: flip-to-active is always gated, needs the
 * elevated credential, and shows the exact budget/reach before approval —
 * the confirmation payload carries enough for that screen to render
 * without a second Whop call. */
export async function queueAdsFlipToActive(engagementId: string, adId: string, budgetCents: number): Promise<string> {
  return queuePendingAction(
    engagementId,
    "whop_ads_flip_to_active",
    { adId, budgetCents },
    `Flip ad ${adId} to active? This starts real Meta spend from your Whop balance ($${(budgetCents / 100).toFixed(2)} budget).`
  );
}

export async function executeAdsFlipToActive(engagementId: string, adId: string): Promise<void> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  await client.request("ads.update", `/v1/ads/${adId}`, { method: "PATCH", body: { ad_campaign: { status: "active" } }, idempotencyKey: `whop-ads-flip-active:${adId}` });
}
