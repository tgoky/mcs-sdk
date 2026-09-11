// src/features/cold-open/server/daily-send.ts
//
// The operational engine: fetch -> historical dedupe -> liveness check ->
// assemble copy -> push -> report. Scoped-down v1 of the Cold Open skill
// pack's daily_send.py pipeline:
//
//   - FETCH: only "csv" lead sources actually pull leads in this pass
//     (apify/sales_nav are connect-only today — see source-connect.ts).
//   - Enrichment/verification stages (Apify-only in the source pack) are
//     not ported.
//   - Historical dedupe is a real DB check, scoped simpler than the
//     source's configurable `lead_dedupe.historical_days` window: any
//     lead already pushed (or dry-run-pushed) for this engagement, on any
//     campaign, is skipped as a duplicate — never spam the same person
//     twice because two ICPs both matched them.
//   - dry-run is the default: coldOpenConfig.dailySendSettings.liveSendEnabled
//     must be explicitly turned on before a push actually reaches the ESP,
//     same contract the source pack's CLI holds itself to (see schema.ts's
//     own comment on that field).

import { db } from "@/lib/db";
import { coldOpenLeads, type ColdOpenRunSummary } from "@/models/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getColdOpenConfig, upsertColdOpenConfig, preconditionCheck, setColdOpenPhaseState } from "./config";
import { CsvFetcher } from "./fetchers/csv";
import type { LeadRow } from "./fetchers/base";
import { verifyDomains } from "./business-status";
import { assembleCopyForLead } from "./copy-engine";
import { createEspAdapter } from "./esp/factory";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

function emptyRunSummary(): ColdOpenRunSummary {
  return { fetched: 0, kept: 0, pushed: 0, held: 0, duplicate: 0, skippedDead: 0, skippedFiltered: 0, errors: [] };
}

export type DailySendSettingsInput = { volume: number; localHour: number; timezone?: string; copyMode: "generate" | "upload"; liveSendEnabled: boolean };

export async function saveDailySendSettings(engagementId: string, input: DailySendSettingsInput): Promise<{ ok: true } | { error: string }> {
  if (!Number.isFinite(input.volume) || input.volume <= 0 || input.volume > 500) {
    return { error: "volume must be a positive number, 500 or fewer per day." };
  }
  if (!Number.isInteger(input.localHour) || input.localHour < 0 || input.localHour > 23) {
    return { error: "localHour must be an integer between 0 and 23." };
  }
  await upsertColdOpenConfig(engagementId, {
    dailySendSettings: { volume: input.volume, localHour: input.localHour, timezone: input.timezone, copyMode: input.copyMode, liveSendEnabled: input.liveSendEnabled },
  });
  await setColdOpenPhaseState(engagementId, "daily_send", "complete");
  return { ok: true };
}

export async function runDailySend(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;
  const runSummary = emptyRunSummary();

  try {
    const gate = await (step ? step.run("precondition-check", () => preconditionCheck(engagementId, "daily-send")) : preconditionCheck(engagementId, "daily-send"));
    if (gate.length > 0) {
      await logStep(runId, { phase: "daily_send_precondition", status: "skipped", detail: gate.join("; ") });
      summary.openItems.push(...gate);
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const config = await (step ? step.run("load-cold-open-config", () => getColdOpenConfig(engagementId)) : getColdOpenConfig(engagementId));
    if (!config?.dailySendSettings || !config.sendPlatform) throw new Error("Daily Send settings or sending platform missing.");

    const volume = config.dailySendSettings.volume;
    summary.whatWasAttempted.push(`Fetching up to ${volume} lead(s) across ${config.leadSources.length} source(s).`);

    // ── FETCH ──────────────────────────────────────────────────────────
    const fetched: LeadRow[] = [];
    for (const source of config.leadSources) {
      if (fetched.length >= volume) break;
      const remaining = volume - fetched.length;
      const limit = Math.min(source.dailyLimit ?? remaining, remaining);

      if (source.fetcherType === "csv") {
        try {
          const rows = await new CsvFetcher(source).fetch(limit);
          fetched.push(...rows);
          await logStep(runId, { phase: "fetch", label: source.icp, status: "success", detail: `csv: fetched ${rows.length} lead(s).` });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          await logStep(runId, { phase: "fetch", label: source.icp, status: "failed", detail });
          runSummary.errors.push(`fetch[${source.icp}]: ${detail}`);
        }
      } else {
        await logStep(runId, { phase: "fetch", label: source.icp, status: "skipped", detail: `${source.fetcherType} live fetch not yet built — connect-only today.` });
      }
    }
    runSummary.fetched = fetched.length;

    // ── CAMPAIGN MAP ───────────────────────────────────────────────────
    const mapped: { lead: LeadRow; campaignId: string }[] = [];
    for (const lead of fetched) {
      const campaignId = config.campaignMap[lead.icp];
      if (!campaignId) {
        runSummary.skippedFiltered++;
        continue;
      }
      mapped.push({ lead, campaignId });
    }

    // ── HISTORICAL DEDUPE ──────────────────────────────────────────────
    const candidateEmails = Array.from(new Set(mapped.map((m) => m.lead.email.toLowerCase())));
    const alreadyContacted = candidateEmails.length
      ? new Set(
          (
            await db
              .select({ email: coldOpenLeads.email })
              .from(coldOpenLeads)
              // "held" and "discarded" both belong here too: a held lead is
              // already sitting in the review queue (see held-leads.ts) and
              // must not be re-fetched/re-personalized on every subsequent
              // run, and a discarded one was already decided against — this
              // used to only exclude "pushed"/"dry_run", so a lead awaiting
              // review got refetched and re-assembled (a real LLM call in
              // "generate" copy mode) on every single Daily Send run for as
              // long as it stayed unreviewed.
              .where(and(eq(coldOpenLeads.engagementId, engagementId), inArray(coldOpenLeads.email, candidateEmails), inArray(coldOpenLeads.status, ["pushed", "dry_run", "held", "discarded"])))
          ).map((r) => r.email.toLowerCase())
        )
      : new Set<string>();

    const deduped = mapped.filter(({ lead }) => !alreadyContacted.has(lead.email.toLowerCase()));
    runSummary.duplicate = mapped.length - deduped.length;

    // ── LIVENESS ───────────────────────────────────────────────────────
    const liveness = await verifyDomains(deduped.map(({ lead }) => lead.domain));
    const live = deduped.filter(({ lead }) => liveness.get(lead.domain)?.alive !== false);
    runSummary.skippedDead = deduped.length - live.length;
    for (const { lead, campaignId } of deduped) {
      if (liveness.get(lead.domain)?.alive === false) {
        await db.insert(coldOpenLeads).values({
          engagementId, runId, email: lead.email, domain: lead.domain, companyName: lead.companyName,
          firstName: lead.firstName || null, lastName: lead.lastName || null, title: lead.title || null,
          icp: lead.icp, source: lead.source, campaignId, status: "skipped_dead",
          statusDetail: { reason: liveness.get(lead.domain)?.status ?? "unknown" },
        }).onConflictDoNothing();
      }
    }

    await logStep(runId, {
      phase: "dedupe_liveness",
      status: "success",
      detail: `${mapped.length} mapped, ${runSummary.duplicate} already contacted, ${runSummary.skippedDead} dead domain(s) — ${live.length} remain.`,
    });

    // ── ASSEMBLE + PUSH ────────────────────────────────────────────────
    const adapter = createEspAdapter(engagementId, config.sendPlatform.platform, { baseUrl: config.sendPlatform.baseUrl });
    const dryRun = !config.dailySendSettings.liveSendEnabled;
    const reviewRequired = new Set(config.reviewRequiredIcps);
    const autoPush = new Set(config.autoPushIcps);

    for (const { lead, campaignId } of live) {
      const copy = await assembleCopyForLead(config, lead);
      if (!copy) {
        runSummary.skippedFiltered++;
        await db.insert(coldOpenLeads).values({
          engagementId, runId, email: lead.email, domain: lead.domain, companyName: lead.companyName,
          firstName: lead.firstName || null, lastName: lead.lastName || null, title: lead.title || null,
          icp: lead.icp, source: lead.source, campaignId, status: "skipped_filtered",
          statusDetail: { reason: `no copy could be assembled for ICP '${lead.icp}' in ${config.dailySendSettings.copyMode} mode` },
        }).onConflictDoNothing();
        continue;
      }

      if (reviewRequired.has(lead.icp) && !autoPush.has(lead.icp)) {
        runSummary.held++;
        await db.insert(coldOpenLeads).values({
          engagementId, runId, email: lead.email, domain: lead.domain, companyName: lead.companyName,
          firstName: lead.firstName || null, lastName: lead.lastName || null, title: lead.title || null,
          icp: lead.icp, source: lead.source, campaignId, status: "held",
          statusDetail: { reason: `icp '${lead.icp}' is review-required`, copy },
        }).onConflictDoNothing();
        continue;
      }

      try {
        const result = await adapter.pushLead(
          { email: lead.email, firstName: lead.firstName, lastName: lead.lastName, companyName: lead.companyName, title: lead.title, city: lead.city, state: lead.state, linkedinUrl: lead.linkedinUrl, icp: lead.icp },
          campaignId,
          copy,
          dryRun
        );
        if (result.status === "pushed") runSummary.pushed++;
        await db.insert(coldOpenLeads).values({
          engagementId, runId, email: lead.email, domain: lead.domain, companyName: lead.companyName,
          firstName: lead.firstName || null, lastName: lead.lastName || null, title: lead.title || null,
          icp: lead.icp, source: lead.source, campaignId, status: result.status,
          statusDetail: result.detail, pushedAt: result.status === "pushed" ? new Date() : null,
        }).onConflictDoNothing();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        runSummary.errors.push(`push[${lead.email}]: ${detail}`);
        await db.insert(coldOpenLeads).values({
          engagementId, runId, email: lead.email, domain: lead.domain, companyName: lead.companyName,
          firstName: lead.firstName || null, lastName: lead.lastName || null, title: lead.title || null,
          icp: lead.icp, source: lead.source, campaignId, status: "error",
          statusDetail: { error: detail },
        }).onConflictDoNothing();
      }
    }
    runSummary.kept = live.length;

    await logStep(runId, {
      phase: "push",
      status: "success",
      detail: `${dryRun ? "[DRY RUN] " : ""}${runSummary.pushed} pushed, ${runSummary.held} held for review, ${runSummary.skippedFiltered} skipped (no copy/no campaign), ${runSummary.errors.length} error(s).`,
    });

    await upsertColdOpenConfig(engagementId, { lastRunAt: new Date(), lastRunSummary: runSummary });

    summary.whatWorked.push(`${runSummary.pushed} lead(s) ${dryRun ? "dry-run " : ""}pushed, ${runSummary.held} held for review.`);
    if (runSummary.errors.length > 0) summary.whatFailed.push(...runSummary.errors);
    if (dryRun) summary.openItems.push("Live sending is off — turn on liveSendEnabled in Daily Send settings once you're ready for real pushes.");

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
