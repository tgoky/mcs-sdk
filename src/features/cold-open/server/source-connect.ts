// src/features/cold-open/server/source-connect.ts
//
// Source Connect: wires a lead source (CSV, Apify, or Sales Navigator)
// per ICP and runs a small test pull. Port of the Cold Open skill pack's
// source_connect.py, scoped down honestly: CSV has a full working test
// pull (fetchers/csv.ts); Apify is accepted as a config choice with a
// credential presence check but no live verification pull yet (the
// plugin's own Apify fetcher — 901 lines covering actor selection, cursor
// pagination, and the enrich/verify stage pipeline — is real, separately-
// scoped follow-up work, not ported here); Sales Navigator is accepted as
// a choice with no automated verification at all (it's an export the
// buyer hands-runs). Same "ask, flagged unbuilt" convention this app
// already applies to pre-call-read's personMatchConfidenceThreshold.

import { getColdOpenConfig, upsertColdOpenConfig, setColdOpenPhaseState } from "./config";
import { CsvFetcher } from "./fetchers/csv";
import { hasCredential } from "@/lib/credentials";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { ColdOpenLeadSource } from "@/models/schema";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export function coldOpenCredentialProvider(kind: "instantly" | "smartlead" | "lemlist" | "reply_io" | "apify"): string {
  return `cold_open_${kind}`;
}

export async function validateLeadSources(engagementId: string, sources: ColdOpenLeadSource[]): Promise<string[]> {
  const problems: string[] = [];
  if (!sources || sources.length === 0) {
    problems.push("at least one lead source is required");
    return problems;
  }
  for (const source of sources) {
    if (!source.icp?.trim()) {
      problems.push("every lead source needs an ICP slug");
      continue;
    }
    if (source.fetcherType === "csv") {
      problems.push(...new CsvFetcher(source).validateConfig().map((p) => `[${source.icp}] ${p}`));
    } else if (source.fetcherType === "apify") {
      if (!source.apifyActorId?.trim()) problems.push(`[${source.icp}] apify source needs an actor id`);
      if (!(await hasCredential(engagementId, coldOpenCredentialProvider("apify")))) {
        problems.push(`[${source.icp}] no Apify API token saved for this engagement yet`);
      }
    }
    // sales_nav: nothing to validate automatically — it's a hand-exported file the buyer manages themselves.
  }
  return problems;
}

export async function saveSourceConnect(engagementId: string, sources: ColdOpenLeadSource[]): Promise<{ ok: true } | { error: string }> {
  const problems = await validateLeadSources(engagementId, sources);
  if (problems.length > 0) {
    return { error: problems.join("\n") };
  }
  await upsertColdOpenConfig(engagementId, { leadSources: sources });
  await setColdOpenPhaseState(engagementId, "source_connect", "complete");
  return { ok: true };
}

export async function runSourceConnect(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const config = await (step ? step.run("load-cold-open-config", () => getColdOpenConfig(engagementId)) : getColdOpenConfig(engagementId));
    if (!config || config.leadSources.length === 0) {
      throw new Error("No lead sources configured — save the Source Connect form before this skill can run.");
    }

    summary.whatWasAttempted.push(`Test-pulling ${config.leadSources.length} configured lead source(s).`);

    for (const source of config.leadSources) {
      if (source.fetcherType === "csv") {
        try {
          const rows = await new CsvFetcher(source).testPull(3);
          await logStep(runId, {
            phase: "source_test_pull",
            label: source.icp,
            status: "success",
            detail: `csv: pulled ${rows.length} test row(s) for ICP '${source.icp}'.`,
          });
          summary.whatWorked.push(`CSV source for '${source.icp}': ${rows.length} test row(s) pulled and normalized cleanly.`);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          await logStep(runId, { phase: "source_test_pull", label: source.icp, status: "failed", detail });
          summary.whatFailed.push(`CSV source for '${source.icp}': ${detail}`);
        }
      } else if (source.fetcherType === "apify") {
        const hasToken = await hasCredential(engagementId, coldOpenCredentialProvider("apify"));
        await logStep(runId, {
          phase: "source_test_pull",
          label: source.icp,
          status: hasToken ? "success" : "failed",
          detail: hasToken
            ? `apify: token connected for ICP '${source.icp}' — actor '${source.apifyActorId}'. Live verification pull not yet built; connection only.`
            : `apify: no API token saved for ICP '${source.icp}'.`,
        });
        summary.openItems.push(`Apify source for '${source.icp}' is connected but not yet test-pulled live — that verification pass is separately-scoped follow-up work.`);
      } else {
        await logStep(runId, { phase: "source_test_pull", label: source.icp, status: "skipped", detail: `sales_nav: hand-exported source for '${source.icp}' — nothing to verify automatically.` });
        summary.openItems.push(`Sales Navigator source for '${source.icp}' has no automated verification — confirm the export manually.`);
      }
    }

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
