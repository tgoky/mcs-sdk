// src/features/whop-agent/server/bulk-promo-codes-service.ts
//
// Playbook 5.8.
import crypto from "crypto";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { WhopTransientError } from "@/lib/whop-agent/errors";
import { isDryRunRequired, clearDryRunForSkill } from "@/lib/whop-agent/dry-run";
import { queuePendingAction } from "@/lib/approval-gate";
import { inngest, whopBulkPromoCodesProcess } from "@/lib/inngest";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

const BULK_CONFIRM_THRESHOLD = 25;

export interface PromoCodeSpec {
  code: string;
  planIds: string[];
  discountPercentage: number;
  newUsersOnly?: boolean;
  existingMembershipsOnly?: boolean;
  churnedUsersOnly?: boolean;
  onePerCustomer?: boolean;
  stock?: number;
  unlimitedStock?: boolean;
  promoDurationMonths?: number;
  expiresAt?: string;
}

export interface BulkPromoCodesResult {
  status: "dry_run" | "queued_for_confirmation" | "queued_live" | "completed";
  created: string[];
  failed: Array<{ code: string; error: string }>;
  pendingActionId?: string;
  runId?: string;
}

async function createOneCode(client: WhopAgentClient, spec: PromoCodeSpec, idempotencyKey: string): Promise<string> {
  const res = await client.request<{ id: string }>("promo_codes.create", "/v1/promo_codes", {
    method: "POST",
    body: {
      code: spec.code,
      plan_ids: spec.planIds,
      discount_type: "percentage",
      amount_off: spec.discountPercentage,
      new_users_only: spec.newUsersOnly,
      existing_memberships_only: spec.existingMembershipsOnly,
      churned_users_only: spec.churnedUsersOnly,
      one_per_customer: spec.onePerCustomer,
      stock: spec.stock,
      unlimited_stock: spec.unlimitedStock,
      promo_duration_months: spec.promoDurationMonths,
      expires_at: spec.expiresAt,
    },
    idempotencyKey,
  });
  return res.id;
}

/**
 * The actual batch-create loop, dispatched through Inngest for every live
 * (non-dry-run) call — see runBulkPromoCodes below. `step` is required, not
 * optional: honoring Whop's literal "Try again in N seconds" hint (Section
 * 5.8) against a batch of up to 25 codes can run well past a serverless
 * route's request timeout, and only step.sleep parks that wait durably
 * (surviving a process recycle mid-batch) instead of blocking the confirming
 * HTTP request on an in-memory setTimeout.
 */
export async function runBatchLive(engagementId: string, runId: string, specs: PromoCodeSpec[], step: StepTools): Promise<BulkPromoCodesResult> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  const created: string[] = [];
  const failed: Array<{ code: string; error: string }> = [];

  for (const [i, spec] of specs.entries()) {
    const idempotencyKey = `whop-promo-batch:${runId}:${i}`;
    let attempt = 0;
    // Section 5.8: "On 429, honor the Try again in N seconds hint
    // literally and resume from the last unwritten index." Retries only
    // the transient case; anything else fails this one code and moves on
    // (fail-open: "Partial batch failure — report which codes created and
    // which failed; retry scoped to the failed subset only").
    for (;;) {
      try {
        const id = await step.run(`create-code-${i}`, () => createOneCode(client, spec, idempotencyKey));
        created.push(id);
        await logStep(runId, { phase: `code_${i}`, status: "success", detail: `${spec.code} → ${id}` });
        break;
      } catch (err) {
        if (err instanceof WhopTransientError && attempt < 3) {
          attempt += 1;
          const waitMs = (err.retryAfterSeconds ?? 1) * 1000;
          await step.sleep(`wait-before-retry-${i}-${attempt}`, waitMs);
          continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ code: spec.code, error: message });
        await logStep(runId, { phase: `code_${i}`, status: "failed", detail: message });
        break;
      }
    }
  }

  // Section 5.8: "Read-back per code or per batch of 10." Not implemented
  // in this pass — there is no confirmed GET-by-id or list-by-ids endpoint
  // for promo codes in the research this build is grounded in (unlike
  // products/plans/webhooks, whose list endpoints and id filters are
  // confirmed live). Flagged honestly in the run summary below rather than
  // faking a verification call that would either error or, worse, create
  // a stray promo code of its own.

  await clearDryRunForSkill(engagementId, "whop-bulk-promo-codes");

  await finishRun(runId, {
    summary: {
      whatWasAttempted: [`Create ${specs.length} promo code(s)`],
      whatWorked: created.map((id) => `Created ${id}`),
      whatFailed: failed.map((f) => `${f.code}: ${f.error}`),
      openItems: [
        ...(failed.length ? ["Retry the failed subset. Idempotency keys are preserved per code index."] : []),
        "Read-back verification not yet implemented for promo codes. No confirmed GET-by-id endpoint. Spot-check in the Whop dashboard.",
      ],
      decisionsMade: [],
    },
  });

  return { status: "completed", created, failed };
}

/** Playbook 5.8's own entry point. Dry-run default (Section 8.2) applies
 * per engagement; batches over 25 are always queued for confirmation
 * (Section 5.8's own guardrail) regardless of dry-run state. A live batch
 * is dispatched to processBulkPromoCodesBatch (src/inngest/whop-agent.ts)
 * rather than executed inline — see runBatchLive's own doc comment. Both
 * of this function's callers (the confirming HTTP route and the approval-
 * gate executor) run in a request context with a hard timeout, and only
 * Inngest's step.sleep can durably honor Whop's 429 backoff hint without
 * blocking that request. */
export async function runBulkPromoCodes(engagementId: string, specs: PromoCodeSpec[], opts: { dryRun?: boolean } = {}): Promise<BulkPromoCodesResult> {
  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-bulk-promo-codes", phase: "batch_create", label: `${specs.length} promo code(s)` });

  try {
    if (specs.length > BULK_CONFIRM_THRESHOLD) {
      const pendingActionId = await queuePendingAction(
        engagementId,
        "whop_bulk_promo_codes_confirm",
        { specs },
        `Create ${specs.length} promo codes in one batch? Promo quantity is an easy field to fat-finger.`
      );
      await finishRun(runId, {
        status: "skipped",
        summary: { whatWasAttempted: ["Batch size check"], whatWorked: [], whatFailed: [], openItems: [`Queued for confirmation as ${pendingActionId}. Batch exceeds the 25-code threshold.`], decisionsMade: [] },
      });
      return { status: "queued_for_confirmation", created: [], failed: [], pendingActionId };
    }

    const dryRun = opts.dryRun ?? (await isDryRunRequired(engagementId, "whop-bulk-promo-codes"));
    if (dryRun) {
      for (const [i, spec] of specs.entries()) {
        await logStep(runId, { phase: `code_${i}`, status: "success", detail: `[DRY RUN] Would create "${spec.code}": ${spec.discountPercentage}% off, plans: ${spec.planIds.join(", ")}` });
      }
      await finishRun(runId, {
        summary: {
          whatWasAttempted: ["Dry run: no writes issued"],
          whatWorked: specs.map((s) => `Would create ${s.code}`),
          whatFailed: [],
          openItems: ["Re-run with dryRun:false to execute for real."],
          decisionsMade: ["First run of Bulk Promo Codes for this engagement. Defaulted to dry-run per Section 8.2."],
        },
      });
      return { status: "dry_run", created: [], failed: [] };
    }

    await inngest.send(whopBulkPromoCodesProcess.create({ runId, engagementId, specs }));
    return { status: "queued_live", created: [], failed: [], runId };
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

export async function executeBulkPromoCodesConfirm(engagementId: string, specs: PromoCodeSpec[]): Promise<void> {
  await runBulkPromoCodes(engagementId, specs, { dryRun: false });
}

/** Section 5.8/5.6's shared open question (Section 14 #2): delete or
 * deactivate? Attempts delete first, falls back to deactivate, and
 * reports which path actually succeeded rather than assuming. */
export async function removePromoCode(engagementId: string, promoCodeId: string): Promise<{ method: "deleted" | "deactivated" }> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  try {
    await client.request("promo_codes.delete", `/v1/promo_codes/${promoCodeId}`, { method: "DELETE", idempotencyKey: `whop-promo-remove:${promoCodeId}` });
    return { method: "deleted" };
  } catch {
    await client.request("promo_codes.deactivate", `/v1/promo_codes/${promoCodeId}`, { method: "PATCH", body: { active: false }, idempotencyKey: `whop-promo-deactivate:${promoCodeId}` });
    return { method: "deactivated" };
  }
}
