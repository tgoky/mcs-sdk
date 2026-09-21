// src/features/whop-agent/server/connect-service.ts
//
// Section 2.3-2.6: the connect flow itself. Runs synchronously from the API
// route the moment an operator pastes a key — the probe is 15 cheap GETs,
// well inside a normal request timeout, so there's no need to fan this out
// through Inngest the way a long-running skill run would be. It still
// writes a real skillRuns row (skillName "whop-connect-audit") so the
// connect attempt shows up in Run History like every other action in this
// app, instead of being invisible plumbing.
import crypto from "crypto";
import { db } from "@/lib/db";
import { whopAgentConnections } from "@/models/schema";
import { eq } from "drizzle-orm";
import { storeCredential } from "@/lib/credentials";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { runScopeProbe, detectWhopCredentialType, findValidatedApiVersionDatePin, type ScopeProbeSummary } from "@/lib/whop-agent/probe";
import { harvestWhopPlans } from "@/lib/paste-key-harvest";

export interface ConnectWhopResult {
  ok: boolean;
  runId: string;
  error?: string;
  probe?: ScopeProbeSummary;
  credentialType?: "bot" | "app" | "oauth" | "unknown";
  pinnedVersionDate?: string | null;
}

/**
 * Section 2.3: "The permissions attached to any given key cannot be
 * inferred from the operator's intent; they must be probed." This is that
 * probe, run start to finish, with the result persisted to
 * whopAgentConnections so every later skill's WhopAgentClient has
 * something to resolve against.
 */
export async function connectWhopAccount(engagementId: string, apiKey: string): Promise<ConnectWhopResult> {
  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-connect-audit", phase: "scope_probe", label: "Connect Whop account" });

  const trimmed = apiKey.trim();
  if (!trimmed) {
    await failRun(runId, new Error("No API key provided."));
    return { ok: false, runId, error: "Paste a Whop API key first." };
  }

  try {
    await logStep(runId, { phase: "scope_probe", status: "running", detail: "Running the 15-call scope probe against Whop." });
    const probe = await runScopeProbe(trimmed);

    if (probe.hardStopped) {
      await logStep(runId, { phase: "scope_probe", status: "failed", detail: "GET /v1/accounts failed — key invalid or has no account." });
      await finishRun(runId, {
        status: "skipped",
        summary: {
          whatWasAttempted: ["Ran the Whop scope probe"],
          whatWorked: [],
          whatFailed: ["GET /v1/accounts rejected the key — nothing else could be probed"],
          openItems: ["Operator needs to paste a valid Whop API key with an account attached"],
          decisionsMade: [],
        },
      });
      return { ok: false, runId, error: "That key is invalid or has no Whop account attached.", probe };
    }
    await logStep(runId, {
      phase: "scope_probe",
      status: "success",
      detail: `Probed ${Object.keys(probe.results).length} endpoints against account ${probe.whopAccountId}.`,
    });

    await logStep(runId, { phase: "credential_type_detection", status: "running" });
    const credentialType = await detectWhopCredentialType(trimmed);
    await logStep(runId, { phase: "credential_type_detection", status: "success", detail: `Detected: ${credentialType}` });

    await logStep(runId, { phase: "pin_selection", status: "running", detail: "Reading and validating an Api-Version-Date candidate." });
    const pinnedVersionDate = await findValidatedApiVersionDatePin(trimmed);
    await logStep(runId, {
      phase: "pin_selection",
      status: pinnedVersionDate ? "success" : "failed",
      detail: pinnedVersionDate ? `Validated pin: ${pinnedVersionDate}` : "No candidate date validated — webhook/REST calls will run unpinned until this is resolved.",
    });

    await logStep(runId, { phase: "persist_connection", status: "running" });
    await storeCredential(engagementId, "whop_bot_api_key", "whop_bot_api_key", trimmed);

    const existing = await db
      .select({ id: whopAgentConnections.id })
      .from(whopAgentConnections)
      .where(eq(whopAgentConnections.engagementId, engagementId))
      .limit(1);

    const values = {
      credentialType,
      whopAccountId: probe.whopAccountId,
      scopeProbeResults: probe.results,
      lastScopeProbeAt: new Date(),
      pinnedVersionDate,
      circuitBreakerState: "closed" as const,
      circuitBreakerTrippedAt: null,
      circuitBreakerReason: null,
      disconnectedAt: null,
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      await db.update(whopAgentConnections).set(values).where(eq(whopAgentConnections.id, existing[0].id));
    } else {
      await db.insert(whopAgentConnections).values({ id: crypto.randomUUID(), engagementId, createdAt: new Date(), ...values });
    }
    await logStep(runId, { phase: "persist_connection", status: "success" });

    const unlockedCount = Object.values(probe.results).filter((r) => r.ok).length;
    const lockedLabels = Object.entries(probe.results)
      .filter(([, r]) => !r.ok)
      .map(([label]) => label);

    await finishRun(runId, {
      summary: {
        whatWasAttempted: ["Probed 15 Whop endpoints", "Detected credential type", "Validated an Api-Version-Date pin"],
        whatWorked: [`${unlockedCount} of ${Object.keys(probe.results).length} probes unlocked`, `Credential type: ${credentialType}`],
        whatFailed: lockedLabels.length ? [`Locked: ${lockedLabels.join(", ")}`] : [],
        openItems: pinnedVersionDate ? [] : ["No validated version-date pin — resolve before enabling webhook-driven skills"],
        decisionsMade: [`Stored Bot API key for this engagement`, `Pinned version date: ${pinnedVersionDate ?? "none"}`],
      },
    });

    // Phase 1 harvest — only when the probe already confirmed /v1/plans is
    // reachable on this key (see paste-key-harvest.ts's own header for why
    // this bypasses the generic harvest dispatcher). Fire-and-forget, same
    // discipline as every other harvest hook: never lets a fact-store
    // failure turn a successful connect into an error response.
    if (probe.results.plans?.ok && probe.whopAccountId) {
      harvestWhopPlans(engagementId, trimmed, probe.whopAccountId).catch((err) =>
        console.error(`[whop-agent connect] plans harvest failed for ${engagementId}:`, err)
      );
    }

    return { ok: true, runId, probe, credentialType, pinnedVersionDate };
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

/**
 * Section 2.7 disconnect: credentials discarded, agent-created webhook
 * subscriptions torn down (handled by the webhook subsystem, not here —
 * see whop-webhook-service.ts's disconnectTeardown), audited-but-not-
 * agent-created subscriptions left alone. This function only owns the
 * connection-state half.
 */
export async function markWhopDisconnected(engagementId: string): Promise<void> {
  await db
    .update(whopAgentConnections)
    .set({ disconnectedAt: new Date(), updatedAt: new Date() })
    .where(eq(whopAgentConnections.engagementId, engagementId));
}
