// src/features/cold-open/server/icp-lock.ts
//
// ICP Lock: the buyer-facing save path (validate + upsert coldOpenConfig's
// product-identity/ICP/sizing-bounds sections) plus the runOnSetup
// executor dispatched once saving succeeds — same two-part shape
// rep-onboarding's onboarding-service.ts uses for Reputation Manager's own
// Pin-Down-equivalent skill. Validation rules are a direct port of the
// Cold Open skill pack's config.py validate_icp_seed: unique ICP slugs,
// weights summing to ~1.0, every ICP has a sizing-bounds entry, and
// product identity is complete.

import { getColdOpenConfig, upsertColdOpenConfig, setColdOpenPhaseState } from "./config";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { ColdOpenIcp, ColdOpenSizingBound } from "@/models/schema";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export type IcpLockInput = {
  productName: string;
  productUrl: string;
  productPrice: string;
  productValueProp: string;
  productAllocation: Record<string, number>;
  icps: ColdOpenIcp[];
  sizingBounds: Record<string, ColdOpenSizingBound>;
  reviewRequiredIcps: string[];
};

const MAX_STRING_LENGTH = 500;
const MAX_LIST_LENGTH = 100;

function isNonEmptyTrimmed(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_STRING_LENGTH;
}

/** Validates the section set icp-lock is about to write. Returns a list
 * of human-readable problems ([] = clean) — direct port of config.py's
 * validate_icp_seed. */
export function validateIcpSeed(input: IcpLockInput): string[] {
  const problems: string[] = [];

  const icps = input.icps ?? [];
  if (icps.length === 0) problems.push("no ICPs captured — at least one is required");
  if (icps.length > MAX_LIST_LENGTH) problems.push(`too many ICPs (${icps.length}) — keep it to a manageable set`);

  const slugs = icps.map((i) => i.slug);
  if (new Set(slugs).size !== slugs.length) problems.push(`duplicate ICP slugs: ${slugs.join(", ")}`);

  for (const i of icps) {
    if (!isNonEmptyTrimmed(i.slug) || !isNonEmptyTrimmed(i.label)) problems.push(`ICP missing slug/label: ${JSON.stringify(i)}`);
  }

  const weightSum = icps.reduce((sum, i) => sum + (Number(i.weight) || 0), 0);
  if (icps.length > 0 && (weightSum < 0.99 || weightSum > 1.01)) {
    problems.push(`ICP weights sum to ${weightSum.toFixed(3)}, need ~1.0`);
  }

  const bounds = input.sizingBounds ?? {};
  for (const i of icps) {
    if (i.slug && !bounds[i.slug]) problems.push(`ICP '${i.slug}' has no sizing bounds entry`);
  }

  if (!isNonEmptyTrimmed(input.productName)) problems.push("product name missing");
  if (!isNonEmptyTrimmed(input.productUrl)) problems.push("product URL missing");
  if (!isNonEmptyTrimmed(input.productValueProp)) problems.push("product value proposition missing");

  const allocation = input.productAllocation ?? {};
  if (Object.keys(allocation).length === 0) {
    problems.push("product allocation empty — single-offer clients get { [offerName]: 1.0 }");
  } else {
    const allocSum = Object.values(allocation).reduce((sum, v) => sum + (Number(v) || 0), 0);
    if (allocSum < 0.99 || allocSum > 1.01) problems.push(`product allocation sums to ${allocSum.toFixed(3)}, need ~1.0`);
  }

  for (const icp of input.reviewRequiredIcps ?? []) {
    if (!slugs.includes(icp)) problems.push(`reviewRequiredIcps entry '${icp}' is not a captured ICP slug`);
  }

  return problems;
}

/** Validates and upserts icp-lock's config sections — the save path
 * behind the icp-lock bridge route, matching rep-onboarding's
 * saveRepIdentityGraphIntake shape (`{ ok: true } | { error: string }`). */
export async function saveIcpLockIntake(engagementId: string, input: IcpLockInput): Promise<{ ok: true } | { error: string }> {
  const problems = validateIcpSeed(input);
  if (problems.length > 0) {
    return { error: "seed failed validation:\n- " + problems.join("\n- ") };
  }

  await upsertColdOpenConfig(engagementId, {
    productIdentity: {
      name: input.productName.trim(),
      url: input.productUrl.trim(),
      price: input.productPrice?.trim() ?? "",
      valueProp: input.productValueProp.trim(),
    },
    productAllocation: input.productAllocation,
    icps: input.icps,
    sizingBounds: input.sizingBounds,
    reviewRequiredIcps: input.reviewRequiredIcps ?? [],
  });
  await setColdOpenPhaseState(engagementId, "icp_lock", "complete");

  return { ok: true };
}

/**
 * icp-lock's execute() — dispatched via the generic skill/run.execute
 * event same as every runOnSetup skill (see skill.ts). The config write
 * itself already happened in saveIcpLockIntake (the bridge route's POST
 * calls that first, then dispatches this the same way rep-onboarding's
 * bridge route does) — there's no further enrichment pass the source
 * pack's own icp_lock.py runs either (unlike rep-onboarding's collision
 * check, it's scaffold-validate-write only), so this just confirms the
 * config is in place and closes the run.
 */
export async function runIcpLock(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const config = await (step ? step.run("load-cold-open-config", () => getColdOpenConfig(engagementId)) : getColdOpenConfig(engagementId));

    if (!config || config.icps.length === 0) {
      throw new Error("No ICP Lock config found for this engagement — save the ICP Lock form before this skill can run.");
    }

    summary.whatWasAttempted.push("Loaded the saved ICP Lock config.");
    await logStep(runId, {
      phase: "icp_lock_confirm",
      status: "success",
      detail: `${config.icps.length} ICP(s) locked, product identity set.`,
    });
    summary.whatWorked.push(`${config.icps.length} ICP(s) locked for ${config.productIdentity?.name ?? "this client"}.`);
    summary.decisionsMade.push("ICPs, weights, sizing bounds, and review-required list locked as confirmed by the buyer.");
    summary.openItems.push("Run Voice Capture, Source Connect, and Send Connect next (any order) before Daily Send can run.");

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
