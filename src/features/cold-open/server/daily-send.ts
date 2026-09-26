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
//   - Historical dedupe is a real DB check (see EXCLUDED_STATUSES below):
//     a lead already pushed, held, or decided on for this engagement, on
//     any campaign, is skipped — never spam the same person twice because
//     two ICPs both matched them. Dry-run rows only count while live
//     sending is off, so turning it on doesn't strand every lead a dry run
//     already touched. Errors are retried (up to MAX_PUSH_ATTEMPTS) and
//     dead domains are rechecked after DEAD_DOMAIN_RECHECK_DAYS.
//   - dry-run is the default: coldOpenConfig.dailySendSettings.liveSendEnabled
//     must be explicitly turned on before a push actually reaches the ESP,
//     same contract the source pack's CLI holds itself to (see schema.ts's
//     own comment on that field).

import { db } from "@/lib/db";
import { coldOpenLeads, type ColdOpenLeadStatus, type ColdOpenRunSummary } from "@/models/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { getColdOpenConfig, upsertColdOpenConfig, preconditionCheck, setColdOpenPhaseState, type ColdOpenConfigRow } from "./config";
import { CsvFetcher } from "./fetchers/csv";
import type { LeadRow } from "./fetchers/base";
import { verifyDomains } from "./business-status";
import { assembleCopyForLead } from "./copy-engine";
import { createEspAdapter } from "./esp/factory";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";
import { isValidTimezone } from "@/lib/timezones";

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
  // A typo here used to fall back to UTC silently, sending at the wrong hour.
  if (input.timezone && !isValidTimezone(input.timezone)) {
    return { error: `"${input.timezone}" isn't a time zone we recognize. Use one like America/New_York.` };
  }
  await upsertColdOpenConfig(engagementId, {
    dailySendSettings: { volume: input.volume, localHour: input.localHour, timezone: input.timezone, copyMode: input.copyMode, liveSendEnabled: input.liveSendEnabled },
  });
  await setColdOpenPhaseState(engagementId, "daily_send", "complete");
  return { ok: true };
}

const CSV_SOURCE_FETCH_CEILING = 10_000;

/** A lead with one of these on file is never selected again. */
const ALWAYS_EXCLUDED_STATUSES = ["pushed", "held", "discarded", "claiming"] as const;
/** Push failures are retried on later runs, up to this many attempts. */
export const MAX_PUSH_ATTEMPTS = 3;
/** A domain found dead isn't rechecked for this long. */
export const DEAD_DOMAIN_RECHECK_DAYS = 30;
/** Statuses a later run may overwrite with a newer outcome. Everything
 * else (pushed, held, discarded, claiming) is final for that row. */
const RETRYABLE_STATUSES = ["error", "dry_run", "skipped_filtered", "skipped_dead"] as const;
/** Upper bound on liveness checks per run, as a multiple of the volume, so
 * a list that's mostly dead can't make one run check thousands of sites. */
const LIVENESS_CHECK_MULTIPLIER = 4;

export interface LeadSelection {
  fetched: number;
  mapped: number;
  campaignMapMisses: number;
  fetchErrors: string[];
  /** Every lead not already handled, in source order — not yet capped to
   * the day's volume (that happens after liveness, in runDailySend). */
  newLeads: { lead: LeadRow; campaignId: string }[];
}

/**
 * Fetch every configured lead source, map to a campaign, and exclude
 * anyone already handled. The volume/per-source dailyLimit cap is applied
 * later, to leads whose domain is live, so dead domains don't use up the
 * day's volume.
 *
 * Fix: csv sources used to be fetched with the fetch-time `limit` capped
 * to this run's remaining volume budget, meaning every run parsed only
 * the file's first `volume` rows, in file order, every single time. Once
 * those rows were marked contacted (pushed/dry_run/held/discarded), the
 * historical dedupe excluded all of them and nothing later in the file
 * was ever reached: a CSV bigger than one day's volume could never be
 * worked through past day one, silently, forever. csv sources are now
 * fetched in full (cheap — see CsvFetcher's own note that a lead list
 * this size costs nothing extra to parse whole) and the volume/dailyLimit
 * cap is applied after historical dedupe, to genuinely-new leads only —
 * that's what actually lets later rows surface as earlier ones get
 * exhausted day over day.
 */
export async function fetchAndSelectNewLeads(
  runId: string,
  engagementId: string,
  // Narrowed to the two fields actually read here — accepting the full
  // ColdOpenConfigRow would reject the Jsonify<ColdOpenConfigRow> shape
  // step.run() returns its Date fields as (see this file's own inngest
  // import comment elsewhere in this codebase for the same quirk); these
  // two fields are plain JSON already, so there's nothing to jsonify away.
  config: Pick<ColdOpenConfigRow, "leadSources" | "campaignMap">,
  liveSend: boolean
): Promise<LeadSelection> {
  // ── FETCH ────────────────────────────────────────────────────────────
  const fetched: LeadRow[] = [];
  const fetchErrors: string[] = [];
  for (const source of config.leadSources) {
    if (source.fetcherType === "csv") {
      try {
        const rows = await new CsvFetcher(source).fetch(CSV_SOURCE_FETCH_CEILING);
        fetched.push(...rows);
        await logStep(runId, { phase: "fetch", label: source.icp, status: "success", detail: `csv: fetched ${rows.length} lead(s).` });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        await logStep(runId, { phase: "fetch", label: source.icp, status: "failed", detail });
        fetchErrors.push(`fetch[${source.icp}]: ${detail}`);
      }
    } else {
      await logStep(runId, { phase: "fetch", label: source.icp, status: "skipped", detail: `${source.fetcherType} live fetch not yet built. connect-only today.` });
    }
  }

  // ── CAMPAIGN MAP ─────────────────────────────────────────────────────
  const mapped: { lead: LeadRow; campaignId: string }[] = [];
  let campaignMapMisses = 0;
  for (const lead of fetched) {
    const campaignId = config.campaignMap[lead.icp];
    if (!campaignId) {
      campaignMapMisses++;
      continue;
    }
    mapped.push({ lead, campaignId });
  }

  // ── HISTORICAL DEDUPE ────────────────────────────────────────────────
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
            // "claiming" too — held-leads.ts's releaseHeldLead briefly
            // parks a lead there mid-approval; even more "already
            // handled" than "held" itself, so it must not be re-fetched
            // out from under an in-flight approve/discard.
            .where(
              and(
                eq(coldOpenLeads.engagementId, engagementId),
                inArray(coldOpenLeads.email, candidateEmails),
                or(
                  inArray(coldOpenLeads.status, [...ALWAYS_EXCLUDED_STATUSES, ...(liveSend ? [] : (["dry_run"] as const))]),
                  and(eq(coldOpenLeads.status, "error"), sql`coalesce((${coldOpenLeads.statusDetail} ->> 'attempts')::int, 1) >= ${MAX_PUSH_ATTEMPTS}`),
                  and(
                    eq(coldOpenLeads.status, "skipped_dead"),
                    sql`coalesce((${coldOpenLeads.statusDetail} ->> 'checkedAt')::timestamptz, ${coldOpenLeads.createdAt}) > now() - make_interval(days => ${DEAD_DOMAIN_RECHECK_DAYS})`
                  )
                )
              )
            )
        ).map((r) => r.email.toLowerCase())
      )
    : new Set<string>();

  // Also one row per person within this run: the same email under two
  // ICPs (or twice in a file) is only taken the first time it appears.
  const seenThisRun = new Set<string>();
  const newLeads = mapped.filter(({ lead }) => {
    const email = lead.email.toLowerCase();
    if (alreadyContacted.has(email) || seenThisRun.has(email)) return false;
    seenThisRun.add(email);
    return true;
  });

  return { fetched: fetched.length, mapped: mapped.length, campaignMapMisses, fetchErrors, newLeads };
}

/**
 * Records one lead's outcome for this run. A lead already on file with a
 * retryable status (an earlier error, dry run, filter skip, or dead
 * domain) is updated to the new outcome and moved to this run; a final
 * status (pushed, held, discarded, claiming) is never overwritten. Errors
 * carry an attempt count, which the selection above uses to stop retrying
 * after MAX_PUSH_ATTEMPTS.
 */
async function recordLead(
  engagementId: string,
  runId: string,
  lead: LeadRow,
  campaignId: string,
  status: ColdOpenLeadStatus,
  detail: Record<string, unknown>,
  pushedAt: Date | null = null
): Promise<void> {
  const statusDetail = status === "error" ? { ...detail, attempts: 1 } : detail;
  await db
    .insert(coldOpenLeads)
    .values({
      engagementId, runId, email: lead.email, domain: lead.domain, companyName: lead.companyName,
      firstName: lead.firstName || null, lastName: lead.lastName || null, title: lead.title || null,
      icp: lead.icp, source: lead.source, campaignId, status, statusDetail, pushedAt,
    })
    .onConflictDoUpdate({
      target: [coldOpenLeads.engagementId, coldOpenLeads.email, coldOpenLeads.campaignId],
      set: {
        runId,
        status,
        pushedAt,
        statusDetail:
          status === "error"
            ? sql`${JSON.stringify(detail)}::jsonb || jsonb_build_object('attempts', case when ${coldOpenLeads.status} = 'error' then coalesce((${coldOpenLeads.statusDetail} ->> 'attempts')::int, 1) + 1 else 1 end)`
            : sql`${JSON.stringify(statusDetail)}::jsonb`,
      },
      setWhere: inArray(coldOpenLeads.status, [...RETRYABLE_STATUSES]),
    });
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
    if (config.sendingPause) {
      const why = "Sending is paused during a reputation incident. Nothing was pushed. It restarts once the incident is resolved and the restart is approved.";
      await logStep(runId, { phase: "daily_send_precondition", status: "skipped", detail: why });
      summary.openItems.push(why);
      await finishRun(runId, { summary, status: "skipped" });
      return;
    }

    const volume = config.dailySendSettings.volume;
    summary.whatWasAttempted.push(`Fetching up to ${volume} lead(s) across ${config.leadSources.length} source(s).`);

    const dryRun = !config.dailySendSettings.liveSendEnabled;
    const selection = await fetchAndSelectNewLeads(runId, engagementId, config, !dryRun);
    runSummary.fetched = selection.fetched;
    runSummary.skippedFiltered += selection.campaignMapMisses;
    runSummary.duplicate = selection.mapped - selection.newLeads.length;
    runSummary.errors.push(...selection.fetchErrors);

    // ── LIVENESS + VOLUME CAP ──────────────────────────────────────────
    // Liveness is checked first, in batches, and only live leads count
    // toward the day's volume and each source's dailyLimit — so a list
    // with dead domains up front still yields a full day of sends.
    const live: typeof selection.newLeads = [];
    const perSourceUsed = new Map<string, number>();
    const sourceFull = (icp: string) => {
      const limit = config.leadSources.find((s) => s.icp === icp)?.dailyLimit;
      return limit !== undefined && (perSourceUsed.get(icp) ?? 0) >= limit;
    };
    const maxChecks = volume * LIVENESS_CHECK_MULTIPLIER;
    let checked = 0;
    let cursor = 0;
    while (live.length < volume && cursor < selection.newLeads.length && checked < maxChecks) {
      const batch: typeof selection.newLeads = [];
      while (batch.length < Math.min(volume - live.length, maxChecks - checked) && cursor < selection.newLeads.length) {
        const item = selection.newLeads[cursor++];
        if (!sourceFull(item.lead.icp)) batch.push(item);
      }
      if (batch.length === 0) break;
      checked += batch.length;
      const liveness = await verifyDomains(batch.map(({ lead }) => lead.domain));
      for (const item of batch) {
        const result = liveness.get(item.lead.domain.trim().toLowerCase());
        if (result?.alive === false) {
          runSummary.skippedDead++;
          await recordLead(engagementId, runId, item.lead, item.campaignId, "skipped_dead", {
            reason: result.status,
            checkedAt: new Date().toISOString(),
          });
          continue;
        }
        if (live.length < volume && !sourceFull(item.lead.icp)) {
          live.push(item);
          perSourceUsed.set(item.lead.icp, (perSourceUsed.get(item.lead.icp) ?? 0) + 1);
        }
      }
    }

    await logStep(runId, {
      phase: "dedupe_liveness",
      status: "success",
      detail: `${selection.mapped} mapped, ${runSummary.duplicate} already handled, ${runSummary.skippedDead} dead domain(s): ${live.length} selected for today.`,
    });

    // ── ASSEMBLE + PUSH ────────────────────────────────────────────────
    const adapter = createEspAdapter(engagementId, config.sendPlatform.platform, { baseUrl: config.sendPlatform.baseUrl });
    const reviewRequired = new Set(config.reviewRequiredIcps);
    const autoPush = new Set(config.autoPushIcps);

    for (const { lead, campaignId } of live) {
      const copy = await assembleCopyForLead(config, lead);
      if (!copy) {
        runSummary.skippedFiltered++;
        await recordLead(engagementId, runId, lead, campaignId, "skipped_filtered", {
          reason: `no copy could be assembled for ICP '${lead.icp}' in ${config.dailySendSettings.copyMode} mode`,
        });
        continue;
      }

      if (reviewRequired.has(lead.icp) && !autoPush.has(lead.icp)) {
        runSummary.held++;
        await recordLead(engagementId, runId, lead, campaignId, "held", { reason: `icp '${lead.icp}' is review-required`, copy });
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
        await recordLead(engagementId, runId, lead, campaignId, result.status, result.detail, result.status === "pushed" ? new Date() : null);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        runSummary.errors.push(`push[${lead.email}]: ${detail}`);
        await recordLead(engagementId, runId, lead, campaignId, "error", { error: detail });
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
    if (dryRun) summary.openItems.push("Live sending is off. Turn on liveSendEnabled in Daily Send settings once you're ready for real pushes.");

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}
