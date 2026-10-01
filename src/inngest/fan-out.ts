// src/inngest/fan-out.ts
//
// Shared shape for scheduled fan-outs. Every cron used to load all of its
// clients in one step, create their runs one INSERT at a time, and send
// every event at the same instant, so each cron's cost and its burst at
// :00 grew with the client count. These page through clients, create a
// page of runs in one INSERT, send events in batches, and give each client
// a stable start offset inside the cron's window.
import crypto from "crypto";
import type { GetStepTools, Inngest } from "inngest";
import { startRuns } from "@/lib/run-log";
import { skillRunEvent, type SkillRunExecuteData } from "@/lib/inngest";

type StepTools = GetStepTools<Inngest.Any>;

const DEFAULT_PAGE_SIZE = 500;
const EVENT_BATCH_SIZE = 500;

/** A stable offset in [0, windowMs) for this key, so the same client lands
 * at the same point in the window every time. */
export function staggerOffsetMs(key: string, windowMs: number): number {
  if (windowMs <= 0) return 0;
  return crypto.createHash("sha1").update(key).digest().readUInt32BE(0) % windowMs;
}

/** When a scheduled item for `key` should start: `fromIso` plus its offset. */
export function staggeredNotBefore(key: string, windowMinutes: number, fromIso: string): string {
  return new Date(new Date(fromIso).getTime() + staggerOffsetMs(key, windowMinutes * 60_000)).toISOString();
}

/** Sleeps until `notBefore` when it's still ahead. A sleeping run holds no
 * concurrency slot. */
export async function waitForStagger(step: StepTools, notBefore: string | undefined): Promise<void> {
  if (!notBefore) return;
  const at = new Date(notBefore);
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return;
  await step.sleepUntil("stagger", at);
}

/** step.sendEvent in batches, each with its own step id. */
export async function sendEventsInBatches<T>(step: StepTools, id: string, events: T[]): Promise<void> {
  for (let i = 0; i < events.length; i += EVENT_BATCH_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await step.sendEvent(`${id}-${i / EVENT_BATCH_SIZE}`, events.slice(i, i + EVENT_BATCH_SIZE) as any);
  }
}

/** The cron's own start time, fixed across Inngest replays. */
export async function scheduledNow(step: StepTools, id: string): Promise<string> {
  return step.run(`${id}-now`, () => new Date().toISOString());
}

export interface ScheduledRunCandidate {
  engagementId: string;
  label?: string;
  /** Extra event data for this run (e.g. auditType, briefTrigger). */
  extra?: Partial<SkillRunExecuteData>;
}

/**
 * Pages through clients, starts a run for each one `select` picks, and
 * sends each page's runs to the skill dispatcher spread across
 * `spreadMinutes`. `loadPage` must return rows ordered by engagementId,
 * strictly after `afterEngagementId`.
 */
export async function dispatchScheduledSkillRuns<Row extends { engagementId: string }>(
  step: StepTools,
  opts: {
    id: string;
    skillName: string;
    phase: string;
    label?: string;
    spreadMinutes: number;
    pageSize?: number;
    loadPage: (afterEngagementId: string | null, limit: number) => Promise<Row[]>;
    select: (rows: Row[], now: Date) => Promise<ScheduledRunCandidate[]> | ScheduledRunCandidate[];
  }
): Promise<number> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const nowIso = await scheduledNow(step, opts.id);
  let after: string | null = null;
  let dispatched = 0;

  for (let page = 0; ; page++) {
    const result: { runs: { runId: string; engagementId: string; extra?: Partial<SkillRunExecuteData> }[]; lastId: string | null; full: boolean } =
      await step.run(`${opts.id}-page-${page}`, async () => {
        const rows = await opts.loadPage(after, pageSize);
        const picked = await opts.select(rows, new Date(nowIso));
        const runs = picked.map((c) => ({ runId: crypto.randomUUID(), engagementId: c.engagementId, label: c.label ?? opts.label, extra: c.extra }));
        await startRuns(runs.map((r) => ({ id: r.runId, engagementId: r.engagementId, skillName: opts.skillName, phase: opts.phase, label: r.label, queued: true })));
        return {
          runs: runs.map(({ runId, engagementId, extra }) => ({ runId, engagementId, extra })),
          lastId: rows.length > 0 ? rows[rows.length - 1].engagementId : null,
          full: rows.length === pageSize,
        };
      });

    if (result.runs.length > 0) {
      // A send that fails leaves these runs queued: the event may have
      // reached Inngest anyway, and if it didn't, the reaper closes them.
      await sendEventsInBatches(
        step,
        `${opts.id}-dispatch-${page}`,
        result.runs.map((r) =>
          skillRunEvent({
            ...r.extra,
            runId: r.runId,
            engagementId: r.engagementId,
            skillName: opts.skillName,
            notBefore: staggeredNotBefore(`${opts.skillName}:${r.engagementId}`, opts.spreadMinutes, nowIso),
            interactive: false,
          })
        )
      );
      dispatched += result.runs.length;
    }
    if (!result.full || !result.lastId) break;
    after = result.lastId;
  }
  return dispatched;
}
