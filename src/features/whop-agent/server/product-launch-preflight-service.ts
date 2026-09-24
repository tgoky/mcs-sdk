// src/features/whop-agent/server/product-launch-preflight-service.ts
//
// Playbook 5.1. Pre-flight validation runs first, before a single write —
// every violation reported at once (Section 5.1's own fail-open table:
// "Halt before any write; report every violation at once, not one at a
// time"). Section 8.2's dry-run default applies here first, since this is
// the first genuinely write-heavy skill in the catalog.
import crypto from "crypto";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { isDryRunRequired, clearDryRunForSkill } from "@/lib/whop-agent/dry-run";
import { addAgentWebhookEvents } from "./webhook-subscription-service";
import { queuePendingAction } from "@/lib/approval-gate";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

const HEADLINE_MAX = 80;
const STATEMENT_DESCRIPTOR_MIN = 5;
const STATEMENT_DESCRIPTOR_MAX = 22;
const METADATA_MAX_KEYS = 50;
const METADATA_MAX_KEY_CHARS = 100;
const METADATA_MAX_VALUE_CHARS = 500;
// Section 5.1: "The cap is application-based with a 24-hour review and no
// API to check approval status." $2,500 in cents.
const PURCHASE_CAP_CENTS = 250_000;
const BULK_CONFIRM_THRESHOLD = 3;

export interface ProductLaunchPlanInput {
  priceCents: number;
  billingType: "one_time" | "recurring";
  billingPeriod?: "monthly" | "yearly" | "weekly";
}

export interface ProductLaunchInput {
  title: string;
  headline: string;
  description?: string;
  statementDescriptor?: string;
  metadata?: Record<string, string>;
  plans: ProductLaunchPlanInput[];
  promoCode?: { code: string; discountPercentage: number };
  webhookEvents?: string[];
}

export interface PreflightViolation {
  field: string;
  message: string;
}

export interface PreflightResult {
  violations: PreflightViolation[];
  /** Indices into input.plans whose price exceeds the purchase cap —
   * Section 5.1: "halts the run and hands off to Playbook 5.2 rather than
   * attempting a save that will be silently rejected." Distinct from
   * `violations` because this isn't a mistake to fix, it's a real price
   * needing the co-pilot's application packet. */
  purchaseCapExceededPlanIndices: number[];
}

export function runPreflightValidation(input: ProductLaunchInput): PreflightResult {
  const violations: PreflightViolation[] = [];

  if (input.headline.length > HEADLINE_MAX) {
    violations.push({
      field: "headline",
      message: `Headline is ${input.headline.length} chars: hard cap is ${HEADLINE_MAX}. Whop accepts the write and truncates silently mid-word, which is worse than a rejection.`,
    });
  }

  if (input.statementDescriptor) {
    const len = input.statementDescriptor.length;
    if (len < STATEMENT_DESCRIPTOR_MIN || len > STATEMENT_DESCRIPTOR_MAX) {
      violations.push({ field: "statementDescriptor", message: `Statement descriptor must be ${STATEMENT_DESCRIPTOR_MIN}-${STATEMENT_DESCRIPTOR_MAX} chars (got ${len}).` });
    }
  }

  if (input.metadata) {
    const entries = Object.entries(input.metadata);
    if (entries.length > METADATA_MAX_KEYS) {
      violations.push({ field: "metadata", message: `${entries.length} metadata keys exceeds the ${METADATA_MAX_KEYS}-key ceiling.` });
    }
    for (const [key, value] of entries) {
      if (key.length > METADATA_MAX_KEY_CHARS) violations.push({ field: "metadata", message: `Metadata key "${key}" exceeds ${METADATA_MAX_KEY_CHARS} chars.` });
      if (value.length > METADATA_MAX_VALUE_CHARS) violations.push({ field: "metadata", message: `Metadata value for "${key}" exceeds ${METADATA_MAX_VALUE_CHARS} chars.` });
    }
  }

  const purchaseCapExceededPlanIndices = input.plans
    .map((plan, index) => (plan.priceCents > PURCHASE_CAP_CENTS ? index : -1))
    .filter((index) => index >= 0);

  return { violations, purchaseCapExceededPlanIndices };
}

export interface ProductLaunchResult {
  status: "halted_on_validation" | "halted_on_purchase_cap" | "dry_run" | "partial_success" | "success";
  violations?: PreflightViolation[];
  purchaseCapExceededPlanIndices?: number[];
  productId?: string;
  createdPlanIds?: string[];
  promoCodeId?: string;
}

/**
 * Playbook 5.1's own executor. Not wired into whop-agent-skill-registry.ts
 * as a plain execute() the way Weekly Ops Report is — this skill needs
 * real launch inputs (title, headline, plans...) a generic scheduled/
 * manual dispatch has no source for, so it's triggered from its own route
 * with the input already collected, same shape pin-down's own onboarding
 * takes pre-collected wizard fields rather than deriving them at dispatch
 * time.
 */
export async function runProductLaunchPreflight(
  engagementId: string,
  input: ProductLaunchInput,
  opts: { dryRun?: boolean; step?: StepTools } = {}
): Promise<ProductLaunchResult> {
  const runId = crypto.randomUUID();
  const { step } = opts;
  const runStep = step
    ? <R,>(id: string, fn: () => Promise<R>) => step.run(id, fn)
    : <R,>(_id: string, fn: () => Promise<R>) => fn();

  await startRun({ id: runId, engagementId, skillName: "whop-product-launch-preflight", phase: "preflight_validation", label: input.title });

  try {
    await logStep(runId, { phase: "preflight_validation", status: "running" });
    const preflight = runPreflightValidation(input);

    if (preflight.violations.length > 0) {
      await logStep(runId, { phase: "preflight_validation", status: "failed", detail: preflight.violations.map((v) => `${v.field}: ${v.message}`).join(" | ") });
      await finishRun(runId, {
        status: "skipped",
        summary: {
          whatWasAttempted: ["Pre-flight validation"],
          whatWorked: [],
          whatFailed: preflight.violations.map((v) => `${v.field}: ${v.message}`),
          openItems: ["Fix every listed violation and re-run. No write was attempted."],
          decisionsMade: [],
        },
      });
      return { status: "halted_on_validation", violations: preflight.violations };
    }

    if (preflight.purchaseCapExceededPlanIndices.length > 0) {
      await logStep(runId, {
        phase: "preflight_validation",
        status: "failed",
        detail: `Plan(s) at index ${preflight.purchaseCapExceededPlanIndices.join(", ")} exceed the $2,500 purchase cap. Whop requires application-based approval first.`,
      });
      await finishRun(runId, {
        status: "skipped",
        summary: {
          whatWasAttempted: ["Pre-flight validation"],
          whatWorked: ["Every non-price validation passed"],
          whatFailed: [`Plan(s) at index ${preflight.purchaseCapExceededPlanIndices.join(", ")} exceed the $2,500 purchase cap`],
          openItems: ["Run the Purchase Cap Application Co-Pilot for the flagged plan(s), then retry once approved."],
          decisionsMade: [],
        },
      });
      return { status: "halted_on_purchase_cap", purchaseCapExceededPlanIndices: preflight.purchaseCapExceededPlanIndices };
    }
    await logStep(runId, { phase: "preflight_validation", status: "success" });

    const dryRun = opts.dryRun ?? (await isDryRunRequired(engagementId, "whop-product-launch-preflight"));
    const client = await WhopAgentClient.forEngagement(engagementId);
    if (!client.accountId) throw new Error("This connection has no Whop account id on file. Reconnect before launching a product.");

    if (dryRun) {
      const plannedCalls = [
        `Create product "${input.title}" (hidden): headline "${input.headline}"`,
        ...input.plans.map((p, i) => `Create plan ${i}: $${(p.priceCents / 100).toFixed(2)} ${p.billingType}${p.billingPeriod ? `/${p.billingPeriod}` : ""}`),
        ...(input.promoCode ? [`Create promo code ${input.promoCode.code} (${input.promoCode.discountPercentage}% off)`] : []),
        ...(input.webhookEvents?.length ? [`Ensure webhook subscription for: ${input.webhookEvents.join(", ")}`] : []),
      ];
      for (const [i, call] of plannedCalls.entries()) {
        await logStep(runId, { phase: `dry_run_call_${i}`, status: "success", detail: `[DRY RUN] ${call}` });
      }
      await finishRun(runId, {
        summary: {
          whatWasAttempted: ["Dry run: no writes issued"],
          whatWorked: plannedCalls,
          whatFailed: [],
          openItems: ["Review the planned calls above, then re-run with dryRun:false to execute for real."],
          decisionsMade: ["This is this engagement's first run of Product Launch Pre-Flight. Defaulted to dry-run per Section 8.2."],
        },
      });
      return { status: "dry_run" };
    }

    await logStep(runId, { phase: "product_create", status: "running" });
    const productRes = await runStep("create-product", () =>
      client.request<{ id: string }>("products.create", "/v1/products", {
        method: "POST",
        query: { account_id: client.accountId! },
        body: { title: input.title, headline: input.headline, description: input.description, visibility: "hidden", statement_descriptor: input.statementDescriptor, metadata: input.metadata },
        idempotencyKey: `whop-product-create:${runId}`,
      })
    );
    const productId = productRes.id;

    // Correction 1 (Section 5.1): read-back must carry account scope.
    // WhopAgentClient's own account-scoping guardrail (Section 8.1)
    // already post-validates every record's account.id against the
    // connected account on every GET — this call additionally confirms
    // the specific product we just created is actually present, not just
    // that whatever came back is correctly scoped.
    const readBack = await runStep("read-back-product", () =>
      client.request<{ data: Array<{ id: string; title: string }> }>("products.list", "/v1/products", { query: { account_id: client.accountId!, id: productId } })
    );
    const confirmed = readBack.data?.some((p) => p.id === productId);
    if (!confirmed) {
      await logStep(runId, { phase: "product_create", status: "failed", detail: "Read-back did not confirm the created product. Flagging as partial-success." });
      await finishRun(runId, {
        status: "success",
        summary: {
          whatWasAttempted: ["Create product", "Read-back verification"],
          whatWorked: [`Product create call returned id ${productId}`],
          whatFailed: ["Read-back did not confirm the product exists as expected"],
          openItems: ["Do not proceed to plan creation. Verify manually in the Whop dashboard before retrying."],
          decisionsMade: [],
        },
      });
      return { status: "partial_success", productId };
    }
    await logStep(runId, { phase: "product_create", status: "success", detail: `Created product ${productId} (hidden), confirmed by read-back.` });

    const createdPlanIds: string[] = [];
    for (const [i, plan] of input.plans.entries()) {
      await logStep(runId, { phase: `plan_create_${i}`, status: "running" });
      try {
        const planRes = await runStep(`create-plan-${i}`, () =>
          client.request<{ id: string }>("plans.create", "/v1/plans", {
            method: "POST",
            body: { product_id: productId, price: plan.priceCents, billing_type: plan.billingType, billing_period: plan.billingPeriod },
            idempotencyKey: `whop-plan-create:${runId}:${i}`,
          })
        );
        createdPlanIds.push(planRes.id);
        await logStep(runId, { phase: `plan_create_${i}`, status: "success", detail: `Plan ${planRes.id}: $${(plan.priceCents / 100).toFixed(2)}` });
      } catch (err) {
        // Fail-open table: "Product create succeeds, plan create fails —
        // Product stays hidden; failed step marked retryable with
        // idempotency key preserved." The idempotency key above is
        // deterministic (runId + plan index), so a retry of this exact
        // run naturally reuses it.
        const message = err instanceof Error ? err.message : String(err);
        await logStep(runId, { phase: `plan_create_${i}`, status: "failed", detail: message });
        await finishRun(runId, {
          summary: {
            whatWasAttempted: [`Create product`, `Create ${input.plans.length} plan(s)`],
            whatWorked: [`Product ${productId} created (hidden)`, ...createdPlanIds.map((id) => `Plan ${id} created`)],
            whatFailed: [`Plan ${i} failed: ${message}`],
            openItems: [`Product stays hidden. Retry plan ${i}: idempotency key whop-plan-create:${runId}:${i} preserved.`],
            decisionsMade: [],
          },
        });
        return { status: "partial_success", productId, createdPlanIds };
      }
    }

    let promoCodeId: string | undefined;
    if (input.promoCode) {
      await logStep(runId, { phase: "promo_code_create", status: "running" });
      try {
        const promoRes = await runStep("create-promo-code", () =>
          client.request<{ id: string }>("promo_codes.create", "/v1/promo_codes", {
            method: "POST",
            body: { code: input.promoCode!.code, plan_ids: createdPlanIds, discount_type: "percentage", amount_off: input.promoCode!.discountPercentage },
            idempotencyKey: `whop-promo-create:${runId}`,
          })
        );
        promoCodeId = promoRes.id;
        await logStep(runId, { phase: "promo_code_create", status: "success", detail: `Promo code ${input.promoCode.code} created (${promoRes.id})` });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logStep(runId, { phase: "promo_code_create", status: "failed", detail: `Promo code creation failed, product/plans unaffected: ${message}` });
      }
    }

    if (input.webhookEvents?.length) {
      await logStep(runId, { phase: "webhook_subscription", status: "running" });
      try {
        await runStep("ensure-webhook-subscription", () => addAgentWebhookEvents(engagementId, input.webhookEvents!));
        await logStep(runId, { phase: "webhook_subscription", status: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logStep(runId, { phase: "webhook_subscription", status: "failed", detail: message });
      }
    }

    await clearDryRunForSkill(engagementId, "whop-product-launch-preflight");

    await finishRun(runId, {
      summary: {
        whatWasAttempted: ["Pre-flight validation", "Product create", `${input.plans.length} plan create(s)`, input.promoCode ? "Promo code create" : "", input.webhookEvents?.length ? "Webhook subscription" : ""].filter(Boolean),
        whatWorked: [`Product ${productId} created (hidden), confirmed by read-back`, ...createdPlanIds.map((id) => `Plan ${id} created`), ...(promoCodeId ? [`Promo code ${promoCodeId} created`] : [])],
        whatFailed: [],
        openItems: ["Product is hidden. Flip to live is a separate, deliberate operator action."],
        decisionsMade: [],
      },
    });

    return { status: "success", productId, createdPlanIds, promoCodeId };
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

export type LaunchBatchResult =
  | { queued: true; pendingActionId: string }
  | { queued: false; results: ProductLaunchResult[] };

/**
 * Section 5.1's guardrail: "Bulk product creation above three products in
 * one run requires explicit confirmation. Product deletion is impossible
 * once a membership, entry, invoice, or review attaches, so creating five
 * products by accident is a permanent catalog cleanup problem." A batch at
 * or under the threshold runs immediately (still individually dry-run-
 * gated per product via runProductLaunchPreflight itself); above it, the
 * whole batch is queued as one confirmable action naming every title.
 */
export async function runProductLaunchBatch(engagementId: string, inputs: ProductLaunchInput[]): Promise<LaunchBatchResult> {
  if (inputs.length > BULK_CONFIRM_THRESHOLD) {
    const pendingActionId = await queuePendingAction(
      engagementId,
      "whop_product_launch_bulk_confirm",
      { inputs },
      `Launch ${inputs.length} products in one run (${inputs.map((i) => i.title).join(", ")})? Whop products can't be deleted once they have a membership, entry, invoice, or review attached.`
    );
    return { queued: true, pendingActionId };
  }

  const results: ProductLaunchResult[] = [];
  for (const input of inputs) {
    results.push(await runProductLaunchPreflight(engagementId, input));
  }
  return { queued: false, results };
}
