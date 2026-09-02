import type { ReactNode } from "react";
import { db } from "@/lib/db";
import {
  engagements,
  skillRuns,
  pendingActions,
  humanBlockers,
  winBackEnrollments,
  auditRunsLog,
  briefOutcomeLog,
  showRateFeatures,
  conversationIntelligenceSessions,
  pileOnSendLog,
  metricsBenchmark,
  type EngagementStack,
} from "@/models/schema";
import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SKILLS, SKILL_INFO, type SkillName } from "@/lib/copy";
import { needsWebhookSetupNudge } from "@/lib/booking-sync-status";
import { computeBucketKey } from "@/features/leak-map/server/leak-map-benchmarks";
import { computeWinBackRevenueAttribution } from "@/features/win-back/server/revenue-attribution";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Two windows on purpose. TREND_DAYS drives the operational stats (run
// volume, success rate, cost, skill comparison) — these are high-frequency
// enough that 30 days is plenty of signal and stays "current." LOOKBACK_DAYS
// drives everything lower-frequency (win-back cadences run for weeks, an
// audit fires weekly/monthly, a call gets a confirmed outcome days later) —
// 30 days of those would mostly show empty sections on a normal-sized
// account, not because nothing happened but because not enough time has
// passed to observe it.
const TREND_DAYS = 30;
const LOOKBACK_DAYS = 90;

/** Kept out of the page component body — the react-hooks/purity rule
 * flags any direct Date.now()/new Date() call inside a component's render,
 * server components included. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`;
}

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

/** ms -> a short human duration, scaling units automatically. */
function fmtDuration(ms: number): string {
  const mins = ms / 60000;
  if (mins < 60) return `${Math.max(1, Math.round(mins))}m`;
  const hours = mins / 60;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Shared layout primitives ────────────────────────────────────────────

function Section({
  title,
  caption,
  right,
  children,
}: {
  title: string;
  caption?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">
            {title}
          </h2>
          {caption && <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-0.5">{caption}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 ${className}`}>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-500 dark:text-zinc-500 px-4 py-7 text-center leading-relaxed">{children}</p>;
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const pctVal = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pctVal}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 p-4">
      <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-600">{label}</p>
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

/** A single horizontal stacked bar with a legend underneath — used for any
 * "what mix of outcomes happened" question (win-back status, resolution
 * source, pile-on delivery path). All-zero renders as an empty track
 * rather than a misleading full bar in one segment's color. */
function SegmentedBar({
  segments,
  total,
}: {
  segments: { label: string; value: number; className: string }[];
  total: number;
}) {
  return (
    <div className="space-y-2.5">
      <div className="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden flex">
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s, i) => (
              <div key={i} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} />
            ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className={`w-2 h-2 rounded-full shrink-0 ${s.className}`} />
            <span className="text-zinc-500 dark:text-zinc-500">{s.label}</span>
            <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
              {s.value}
              {total > 0 && <span className="text-zinc-400 dark:text-zinc-600">{` (${Math.round((s.value / total) * 100)}%)`}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal-bar leaderboard — top objections, recurring leaks,
 * anything that's fundamentally "count these strings and show the most
 * common ones." */
function RankedList({
  items,
  unit = "",
}: {
  items: { label: string; count: number; detail?: string }[];
  unit?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-900">
      {items.map((item, i) => (
        <div key={i} className="px-4 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-zinc-700 dark:text-zinc-300 truncate">{item.label}</span>
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-500 shrink-0">
              {item.count}
              {unit}
              {item.detail && <span className="ml-2 text-zinc-400 dark:text-zinc-600">{item.detail}</span>}
            </span>
          </div>
          <Bar value={item.count} max={max} className="bg-ink" />
        </div>
      ))}
    </div>
  );
}

/** Daily stacked-volume chart for the last N days, plain HTML/CSS (no SVG)
 * so it composes with the rest of the page's div-based bar language instead
 * of introducing a second, differently-behaved chart primitive. Each column
 * is success (bottom) + terminal-failure (middle) + still-in-flight/skipped
 * (top), scaled to the busiest day in the window. */
function DailyActivityChart({
  days,
}: {
  days: { key: string; label: string; success: number; failed: number; other: number }[];
}) {
  const maxTotal = Math.max(1, ...days.map((d) => d.success + d.failed + d.other));
  // Label roughly every 5th column plus the last one, so a 30-column strip
  // doesn't turn into unreadable text soup.
  return (
    <div>
      <div className="flex items-end gap-[3px] h-28">
        {days.map((d) => {
          const total = d.success + d.failed + d.other;
          const totalH = total > 0 ? Math.max(4, (total / maxTotal) * 100) : 0;
          const successH = total > 0 ? (d.success / total) * 100 : 0;
          const failedH = total > 0 ? (d.failed / total) * 100 : 0;
          const otherH = total > 0 ? (d.other / total) * 100 : 0;
          return (
            <div key={d.key} className="flex-1 h-full flex flex-col justify-end min-w-[2px]" title={`${d.label}: ${total} run${total !== 1 ? "s" : ""}`}>
              <div className="w-full rounded-t-[2px] overflow-hidden flex flex-col-reverse" style={{ height: `${totalH}%` }}>
                {successH > 0 && <div className="w-full bg-emerald-500/70 dark:bg-emerald-400/70" style={{ height: `${successH}%` }} />}
                {failedH > 0 && <div className="w-full bg-rose-500/70 dark:bg-rose-400/70" style={{ height: `${failedH}%` }} />}
                {otherH > 0 && <div className="w-full bg-zinc-300 dark:bg-zinc-700" style={{ height: `${otherH}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] mt-1">
        {days.map((d, i) => (
          <div key={d.key} className="flex-1 text-center min-w-[2px]">
            {(i % 5 === 0 || i === days.length - 1) && (
              <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-600">{d.label}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        <Legend swatch="bg-emerald-500/70 dark:bg-emerald-400/70" label="Success" />
        <Legend swatch="bg-rose-500/70 dark:bg-rose-400/70" label="Failed / timed out / cancelled" />
        <Legend swatch="bg-zinc-300 dark:bg-zinc-700" label="Still running / skipped" />
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full shrink-0 ${swatch}`} />
      <span className="text-zinc-500 dark:text-zinc-500">{label}</span>
    </div>
  );
}

/** Predicted-vs-actual calibration curve for show-rate scoring. This is the
 * one chart on the page that's a genuine X/Y plot rather than a bar, so it's
 * the one place raw SVG earns its keep. Uses the default (uniform) aspect
 * ratio behavior — width scales with the container, height follows the
 * viewBox proportionally — so points stay circular instead of stretching. */
function CalibrationChart({
  buckets,
}: {
  buckets: { predictedMid: number; actualRate: number; n: number }[];
}) {
  const W = 320;
  const H = 260;
  const pad = 32;
  const plot = W - pad * 2;
  const toX = (v: number) => pad + (v / 100) * plot;
  const toY = (v: number) => H - pad - (v / 100) * plot;
  const maxN = Math.max(1, ...buckets.map((b) => b.n));
  const linePath = buckets.map((b, i) => `${i === 0 ? "M" : "L"}${toX(b.predictedMid).toFixed(1)},${toY(b.actualRate).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Predicted vs actual show rate calibration chart">
      {/* Axes */}
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="currentColor" className="text-zinc-300 dark:text-zinc-700" strokeWidth={1} />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="currentColor" className="text-zinc-300 dark:text-zinc-700" strokeWidth={1} />
      {/* Perfect-calibration diagonal */}
      <line
        x1={toX(0)}
        y1={toY(0)}
        x2={toX(100)}
        y2={toY(100)}
        stroke="currentColor"
        className="text-zinc-300 dark:text-zinc-700"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {/* Observed line */}
      {buckets.length > 1 && (
        <path d={linePath} fill="none" stroke="currentColor" className="text-ink dark:text-ink-hover" strokeWidth={1.75} />
      )}
      {buckets.map((b, i) => (
        <circle
          key={i}
          cx={toX(b.predictedMid)}
          cy={toY(b.actualRate)}
          r={3 + (b.n / maxN) * 4}
          className="fill-ink dark:fill-ink-hover"
        />
      ))}
      {/* Axis labels */}
      <text x={pad} y={H - pad + 14} fontSize={9} className="fill-zinc-400 dark:fill-zinc-600" fontFamily="monospace">0%</text>
      <text x={W - pad - 22} y={H - pad + 14} fontSize={9} className="fill-zinc-400 dark:fill-zinc-600" fontFamily="monospace">100%</text>
      <text x={pad - 26} y={H - pad + 3} fontSize={9} className="fill-zinc-400 dark:fill-zinc-600" fontFamily="monospace">0%</text>
      <text x={pad - 30} y={pad + 3} fontSize={9} className="fill-zinc-400 dark:fill-zinc-600" fontFamily="monospace">100%</text>
    </svg>
  );
}

/** Where this account's current value sits against cross-tenant p25/p50/p75/
 * p90 for the same offer bucket. Track spans [min(p25,current), max(p90,
 * current)] so an outlier account is still visible on its own chart instead
 * of clipping off the edge. */
function RangeBar({
  current,
  p25,
  p50,
  p75,
  p90,
}: {
  current: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}) {
  const lo = Math.min(p25, current);
  const hi = Math.max(p90, current, lo + 0.001);
  const at = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;

  return (
    <div className="relative h-6 mt-1">
      <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700"
        style={{ left: at(p25), width: `calc(${at(p75)} - ${at(p25)})` }}
        title="Typical range (p25-p75)"
      />
      <div className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-zinc-400 dark:bg-zinc-600" style={{ left: at(p50) }} title="Median (p50)" />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-ink dark:bg-ink-hover ring-2 ring-white dark:ring-zinc-950"
        style={{ left: `calc(${at(current)} - 5px)` }}
        title="This account"
      />
    </div>
  );
}

/**
 * Real numbers only — every figure here comes straight from skill_runs,
 * pending_actions, human_blockers, win_back_enrollments, audit_runs_log,
 * show_rate_features, conversation_intelligence_sessions, pile_on_send_log,
 * brief_outcome_log, and metrics_benchmark. Nothing is estimated or
 * simulated; anything without enough data yet says so instead of rendering
 * a placeholder chart.
 */
export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session.whopUserId) redirect("/api/auth/login");
  const whopUserId = session.whopUserId;

  const since30 = daysAgo(TREND_DAYS);
  const since90 = daysAgo(LOOKBACK_DAYS);

  // Engagement roster is needed up front — booking sync, the benchmark
  // section, and the per-engagement revenue-attribution calls below all key
  // off it.
  const engagementRows = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack, offerDetails: engagements.offerDetails })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.deletedAt)));

  const [
    runRows,
    openPending,
    openBlockers,
    pendingWindow,
    blockersWindow,
    briefOutcomeWindow,
    winBackWindow,
    showRateWindow,
    objectionsWindow,
    auditWindow,
    pileOnWindow,
    revenueResults,
  ] = await Promise.all([
    db
      .select({ skillName: skillRuns.skillName, status: skillRuns.status, costInCents: skillRuns.costInCents, startedAt: skillRuns.startedAt, completedAt: skillRuns.completedAt })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(skillRuns.startedAt, since30), isNull(engagements.deletedAt))),

    db
      .select({ id: pendingActions.id })
      .from(pendingActions)
      .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(pendingActions.status, "pending"), isNull(engagements.deletedAt))),

    db
      .select({ id: humanBlockers.id })
      .from(humanBlockers)
      .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(humanBlockers.status, "open"), isNull(engagements.deletedAt))),

    db
      .select({ actionType: pendingActions.actionType, status: pendingActions.status, createdAt: pendingActions.createdAt, decidedAt: pendingActions.decidedAt })
      .from(pendingActions)
      .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(pendingActions.createdAt, since90), isNull(engagements.deletedAt))),

    db
      .select({ blockerType: humanBlockers.blockerType, status: humanBlockers.status, createdAt: humanBlockers.createdAt, resolvedAt: humanBlockers.resolvedAt })
      .from(humanBlockers)
      .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(humanBlockers.createdAt, since90), isNull(engagements.deletedAt))),

    db
      .select({ outcome: briefOutcomeLog.outcome, source: briefOutcomeLog.source, loggedAt: briefOutcomeLog.loggedAt })
      .from(briefOutcomeLog)
      .innerJoin(engagements, eq(briefOutcomeLog.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(briefOutcomeLog.loggedAt, since90), isNull(engagements.deletedAt))),

    db
      .select({ status: winBackEnrollments.status, enrolledAt: winBackEnrollments.enrolledAt, exitedAt: winBackEnrollments.exitedAt, lostAt: winBackEnrollments.lostAt })
      .from(winBackEnrollments)
      .innerJoin(engagements, eq(winBackEnrollments.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(winBackEnrollments.enrolledAt, since90), isNull(engagements.deletedAt))),

    db
      .select({ predictedShowProbability: showRateFeatures.predictedShowProbability, actualOutcome: showRateFeatures.actualOutcome })
      .from(showRateFeatures)
      .innerJoin(engagements, eq(showRateFeatures.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          gte(showRateFeatures.createdAt, since90),
          isNotNull(showRateFeatures.actualOutcome),
          isNull(engagements.deletedAt)
        )
      ),

    db
      .select({ extractedObjections: conversationIntelligenceSessions.extractedObjections })
      .from(conversationIntelligenceSessions)
      .innerJoin(engagements, eq(conversationIntelligenceSessions.engagementId, engagements.engagementId))
      .where(
        and(
          eq(engagements.whopUserId, whopUserId),
          gte(conversationIntelligenceSessions.createdAt, since90),
          isNotNull(conversationIntelligenceSessions.extractedObjections),
          isNull(engagements.deletedAt)
        )
      ),

    db
      .select({ engagementId: auditRunsLog.engagementId, topIssues: auditRunsLog.topIssues, createdAt: auditRunsLog.createdAt })
      .from(auditRunsLog)
      .innerJoin(engagements, eq(auditRunsLog.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(auditRunsLog.createdAt, since90), isNull(engagements.deletedAt))),

    db
      .select({ sentVia: pileOnSendLog.sentVia, error: pileOnSendLog.error })
      .from(pileOnSendLog)
      .innerJoin(engagements, eq(pileOnSendLog.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(pileOnSendLog.createdAt, since90), isNull(engagements.deletedAt))),

    // Win-Back's own revenue-attribution module, reused as-is (current
    // quarter, per engagement) rather than re-deriving the price-parsing
    // and rebooked-in-window logic a second time here.
    Promise.all(engagementRows.map((e) => computeWinBackRevenueAttribution(e.engagementId))),
  ]);

  // ── Skill comparison + top-line run stats (TREND_DAYS window) ─────────
  const perSkill: Record<SkillName, { total: number; success: number; terminalFailure: number; costCents: number; durationsMs: number[] }> = {
    "pin-down": { total: 0, success: 0, terminalFailure: 0, costCents: 0, durationsMs: [] },
    "pile-on": { total: 0, success: 0, terminalFailure: 0, costCents: 0, durationsMs: [] },
    "pre-call-read": { total: 0, success: 0, terminalFailure: 0, costCents: 0, durationsMs: [] },
    "win-back": { total: 0, success: 0, terminalFailure: 0, costCents: 0, durationsMs: [] },
    "leak-map": { total: 0, success: 0, terminalFailure: 0, costCents: 0, durationsMs: [] },
  };

  let totalRuns = 0;
  let totalSuccess = 0;
  let totalTerminalFailure = 0; // failed | timed_out | cancelled — excludes skipped/running from the rate denominator
  let totalCostCents = 0;

  const dayBuckets = new Map<string, { success: number; failed: number; other: number }>();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = daysAgo(i);
    dayBuckets.set(dayKey(d), { success: 0, failed: 0, other: 0 });
  }

  for (const run of runRows) {
    const isSuccess = run.status === "success";
    const isTerminalFailure = run.status === "failed" || run.status === "timed_out" || run.status === "cancelled";

    totalRuns++;
    totalCostCents += run.costInCents ?? 0;
    if (isSuccess) totalSuccess++;
    if (isTerminalFailure) totalTerminalFailure++;

    const skill = run.skillName as SkillName;
    if (SKILLS.includes(skill)) {
      const s = perSkill[skill];
      s.total++;
      s.costCents += run.costInCents ?? 0;
      if (isSuccess) s.success++;
      if (isTerminalFailure) s.terminalFailure++;
      if (run.completedAt) s.durationsMs.push(run.completedAt.getTime() - run.startedAt.getTime());
    }

    const bucket = dayBuckets.get(dayKey(run.startedAt));
    if (bucket) {
      if (isSuccess) bucket.success++;
      else if (isTerminalFailure) bucket.failed++;
      else bucket.other++;
    }
  }

  // Rate denominator is resolved runs only (success + terminal failure) —
  // a run still in flight or skipped for being paused/disabled isn't a
  // pass or a fail yet, so counting it against the rate would just dilute
  // the number toward whatever the skip/running share happens to be.
  const resolvedRuns = totalSuccess + totalTerminalFailure;
  const successRate = pct(totalSuccess, resolvedRuns);
  const maxSkillRuns = Math.max(1, ...Object.values(perSkill).map((s) => s.total));

  const dailyActivity = Array.from(dayBuckets.entries()).map(([key, v]) => ({
    key,
    label: shortDay(new Date(key)),
    ...v,
  }));

  // ── Queue resolution (LOOKBACK_DAYS window) ────────────────────────────
  const decidedActions = pendingWindow.filter((p): p is typeof p & { decidedAt: Date } => p.decidedAt !== null);
  const actionResolutionMs = decidedActions.map((p) => p.decidedAt.getTime() - p.createdAt.getTime());
  const actionMedianMs = median(actionResolutionMs);
  const actionP90Ms = percentile(actionResolutionMs, 90);

  const resolvedBlockers = blockersWindow.filter((b): b is typeof b & { resolvedAt: Date } => b.resolvedAt !== null && (b.status === "resolved" || b.status === "abandoned"));
  const blockerResolutionMs = resolvedBlockers.map((b) => b.resolvedAt.getTime() - b.createdAt.getTime());
  const blockerMedianMs = median(blockerResolutionMs);
  const blockerP90Ms = percentile(blockerResolutionMs, 90);

  // By-type breakdown, smallest, most self-contained view of "what kind of
  // human-in-the-loop step is slowest to clear."
  const actionTypeMedians = new Map<string, number[]>();
  for (const a of decidedActions) {
    const arr = actionTypeMedians.get(a.actionType) ?? [];
    arr.push(a.decidedAt.getTime() - a.createdAt.getTime());
    actionTypeMedians.set(a.actionType, arr);
  }
  const blockerTypeMedians = new Map<string, number[]>();
  for (const b of resolvedBlockers) {
    const arr = blockerTypeMedians.get(b.blockerType) ?? [];
    arr.push(b.resolvedAt.getTime() - b.createdAt.getTime());
    blockerTypeMedians.set(b.blockerType, arr);
  }

  const overallMedianResolutionMs = median([...actionResolutionMs, ...blockerResolutionMs]);

  // How outcomes actually get resolved — the 4-source split (dashboard /
  // slack / recall_bot / auto_sweep) that queue-alerts work added.
  const sourceCounts = { dashboard: 0, slack: 0, recall_bot: 0, auto_sweep: 0, other: 0 };
  for (const row of briefOutcomeWindow) {
    const src = row.source as keyof typeof sourceCounts | null;
    if (src && src in sourceCounts && src !== "other") sourceCounts[src]++;
    else sourceCounts.other++;
  }
  const outcomeTotal = briefOutcomeWindow.length;

  // ── Win-Back recovery funnel ────────────────────────────────────────────
  const winBackTotal = winBackWindow.length;
  const winBackCounts = { active: 0, rebooked: 0, lost: 0, reply_exited: 0, corrected: 0, other: 0 };
  const recoveryDaysList: number[] = [];
  for (const row of winBackWindow) {
    const s = row.status as keyof typeof winBackCounts;
    if (s in winBackCounts) winBackCounts[s]++;
    else winBackCounts.other++;
    if (row.status === "rebooked" && row.exitedAt) {
      recoveryDaysList.push((row.exitedAt.getTime() - row.enrolledAt.getTime()) / (24 * 60 * 60 * 1000));
    }
  }
  const winBackResolved = winBackTotal - winBackCounts.active;
  const recoveryRateOfResolved = pct(winBackCounts.rebooked, winBackResolved);
  const medianRecoveryDays = median(recoveryDaysList);

  const revenueTotal = revenueResults.reduce((sum, r) => sum + r.totalRevenue, 0);
  const revenueRecoveredCount = revenueResults.reduce((sum, r) => sum + r.recoveredCount, 0);
  const revenuePeriodLabel = revenueResults[0]?.periodLabel ?? "this quarter";

  // ── Show-rate calibration ──────────────────────────────────────────────
  const usableScored = showRateWindow.filter((r) => r.actualOutcome === "showed" || r.actualOutcome === "no_show");
  const calibrationBuckets: { predictedMid: number; actualRate: number; n: number }[] = [];
  let brierSum = 0;
  for (let decile = 0; decile < 10; decile++) {
    const lo = decile * 10;
    const hi = lo + 10;
    const inBucket = usableScored.filter((r) => (decile === 9 ? r.predictedShowProbability >= lo && r.predictedShowProbability <= 100 : r.predictedShowProbability >= lo && r.predictedShowProbability < hi));
    if (inBucket.length < 3) continue; // same statistical-floor philosophy Leak Map already applies elsewhere in this app
    const showedCount = inBucket.filter((r) => r.actualOutcome === "showed").length;
    calibrationBuckets.push({ predictedMid: lo + 5, actualRate: (showedCount / inBucket.length) * 100, n: inBucket.length });
  }
  for (const r of usableScored) {
    const actual = r.actualOutcome === "showed" ? 1 : 0;
    const predicted = r.predictedShowProbability / 100;
    brierSum += (predicted - actual) ** 2;
  }
  const brierScore = usableScored.length > 0 ? brierSum / usableScored.length : null;
  const overallActualShowRate = pct(usableScored.filter((r) => r.actualOutcome === "showed").length, usableScored.length);

  // ── Top objections detected on real calls ───────────────────────────────
  const objectionCounts = new Map<string, { display: string; count: number }>();
  for (const row of objectionsWindow) {
    for (const raw of row.extractedObjections ?? []) {
      const key = raw.trim().toLowerCase();
      if (!key) continue;
      const existing = objectionCounts.get(key);
      if (existing) existing.count++;
      else objectionCounts.set(key, { display: raw.trim(), count: 1 });
    }
  }
  const topObjections = [...objectionCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  // ── Recurring funnel leaks (Leak Map) ───────────────────────────────────
  const leakCounts = new Map<string, { count: number; highCount: number }>();
  for (const row of auditWindow) {
    const issues = (row.topIssues ?? []) as { name: string; severity: "high" | "medium" | "low" | "none" }[];
    for (const issue of issues) {
      if (issue.severity !== "high" && issue.severity !== "medium") continue;
      const existing = leakCounts.get(issue.name) ?? { count: 0, highCount: 0 };
      existing.count++;
      if (issue.severity === "high") existing.highCount++;
      leakCounts.set(issue.name, existing);
    }
  }
  const auditRunCount = auditWindow.length;
  const topLeaks = [...leakCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, v]) => ({ label: name, count: v.count, detail: v.highCount > 0 ? `${v.highCount} high-severity` : undefined }));

  // ── Pile-On delivery mix ────────────────────────────────────────────────
  const pileOnTotal = pileOnWindow.length;
  const pileOnHybrid = pileOnWindow.filter((r) => r.sentVia === "hybrid").length;
  const pileOnFallback = pileOnWindow.filter((r) => r.sentVia === "fallback").length;
  const pileOnErrors = pileOnWindow.filter((r) => r.error !== null).length;

  // ── Cross-client benchmark comparison ───────────────────────────────────
  const engagementBuckets = engagementRows
    .map((e) => ({ e, bucket: computeBucketKey(e.offerDetails ?? null) }))
    .filter((x): x is { e: (typeof engagementRows)[number]; bucket: string } => x.bucket !== null);

  // auditWindow isn't guaranteed to arrive in createdAt order per engagement
  // after the join — re-derive "latest" explicitly rather than trusting
  // insertion order.
  const latestAuditRowByEngagement = new Map<string, { topIssues: { name: string; current: number }[]; createdAt: Date }>();
  for (const row of auditWindow) {
    const existing = latestAuditRowByEngagement.get(row.engagementId);
    if (!existing || row.createdAt > existing.createdAt) {
      latestAuditRowByEngagement.set(row.engagementId, { topIssues: (row.topIssues ?? []) as { name: string; current: number }[], createdAt: row.createdAt });
    }
  }

  const uniqueBuckets = [...new Set(engagementBuckets.map((x) => x.bucket))];
  const benchmarkRows = uniqueBuckets.length > 0 ? await db.select().from(metricsBenchmark).where(inArray(metricsBenchmark.bucket, uniqueBuckets)) : [];

  type BenchmarkComparison = { buyer: string; metricName: string; current: number; p25: number; p50: number; p75: number; p90: number; sampleSize: number; bucketDisplay: string };
  const benchmarkComparisons: BenchmarkComparison[] = [];
  for (const { e, bucket } of engagementBuckets) {
    const latest = latestAuditRowByEngagement.get(e.engagementId);
    if (!latest) continue;
    for (const issue of latest.topIssues) {
      const match = benchmarkRows.find((b) => b.bucket === bucket && b.metricName === issue.name);
      if (!match) continue;
      benchmarkComparisons.push({
        buyer: e.buyer,
        metricName: issue.name,
        current: issue.current,
        p25: parseFloat(match.p25),
        p50: parseFloat(match.p50),
        p75: parseFloat(match.p75),
        p90: parseFloat(match.p90),
        sampleSize: match.sampleSize,
        bucketDisplay: bucket.split("|").join(" · "),
      });
    }
  }
  // Surface the biggest deviations from the peer median first — that's the
  // actionable end of the list, not an alphabetical dump.
  benchmarkComparisons.sort((a, b) => Math.abs(b.current - b.p50) / Math.max(1, b.p50) - Math.abs(a.current - a.p50) / Math.max(1, a.p50));
  const topBenchmarkComparisons = benchmarkComparisons.slice(0, 8);

  // ── Booking sync distribution (unchanged) ───────────────────────────────
  let webhookCount = 0;
  let pollingCount = 0;
  let unsetCount = 0;
  let setupNeededCount = 0;
  let connectedCount = 0;
  for (const row of engagementRows) {
    const stack = row.stack as EngagementStack | null;
    if (!stack?.booking_platform) continue;
    connectedCount++;
    if (stack.webhook_receiver_mode === "webhook") webhookCount++;
    else if (stack.webhook_receiver_mode === "polling") pollingCount++;
    else unsetCount++;
    if (needsWebhookSetupNudge(stack)) setupNeededCount++;
  }

  return (
    <div className="relative min-h-screen w-full transition-colors duration-200 overflow-hidden pb-10">
      {/* --- HYPER-MICRO TIGHT DOT GRID (0.5px / 6px grid) --- */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-dot-grid"
        aria-hidden="true"
      />

      {/* --- ANALYTICS CONTENT --- */}
      <div className="relative z-10 w-full space-y-10 px-6 py-6">
        <div>
          <h1 className="text-xl tracking-tight" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
            Analytics
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Last {TREND_DAYS} days of activity, and up to {LOOKBACK_DAYS} days of slower-moving signals, across every engagement on this account.
          </p>
        </div>

        {/* Top-line stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total runs" value={String(totalRuns)} sub={`${engagementRows.length} engagement${engagementRows.length !== 1 ? "s" : ""}`} />
          <StatCard label="Success rate" value={successRate !== null ? `${successRate}%` : "—"} sub={resolvedRuns > 0 ? `${totalSuccess}/${resolvedRuns} resolved runs` : "No resolved runs yet"} />
          <StatCard label="Model spend" value={fmtCents(totalCostCents)} sub={`last ${TREND_DAYS}d, all skills`} />
          <StatCard
            label="Revenue recovered"
            value={revenueTotal > 0 ? fmtDollars(revenueTotal) : "—"}
            sub={`${revenueRecoveredCount} rebooked, ${revenuePeriodLabel}`}
          />
          <StatCard label="Queue open" value={String(openPending.length + openBlockers.length)} sub={`${decidedActions.length + resolvedBlockers.length} resolved in ${LOOKBACK_DAYS}d`} />
          <StatCard
            label="Median resolution time"
            value={overallMedianResolutionMs !== null ? fmtDuration(overallMedianResolutionMs) : "—"}
            sub={`across ${decidedActions.length + resolvedBlockers.length} decisions, ${LOOKBACK_DAYS}d`}
          />
        </div>

        {/* Daily activity trend */}
        <Section title="Daily activity" caption={`Run volume and outcome mix, last ${TREND_DAYS} days`}>
          <Card className="p-4">
            {totalRuns === 0 ? <EmptyState>No skill runs in the last {TREND_DAYS} days.</EmptyState> : <DailyActivityChart days={dailyActivity} />}
          </Card>
        </Section>

        {/* Cross-skill comparison */}
        <Section title="Skill comparison" caption={`Last ${TREND_DAYS} days — volume share, success rate, and unit cost side by side`}>
          <Card>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-x-4 px-4 py-2 text-[10.5px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-600 border-b border-zinc-200 dark:border-zinc-900">
              <span>Skill</span>
              <span>Volume share</span>
              <span>Success rate</span>
              <span className="text-right">Avg cost</span>
              <span className="text-right">Avg duration</span>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-900">
              {SKILLS.map((skill) => {
                const s = perSkill[skill];
                const resolved = s.success + s.terminalFailure;
                const rate = pct(s.success, resolved);
                const volumeSharePct = pct(s.total, totalRuns) ?? 0;
                const avgCost = s.total > 0 ? s.costCents / s.total : 0;
                const avgDurationMs = s.durationsMs.length > 0 ? s.durationsMs.reduce((a, b) => a + b, 0) / s.durationsMs.length : null;
                return (
                  <div key={skill} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-x-4 px-4 py-3 items-center">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{SKILL_INFO[skill].name}</span>
                    <div className="space-y-1">
                      <Bar value={s.total} max={maxSkillRuns} className="bg-ink" />
                      <span className="text-[10.5px] font-mono text-zinc-400 dark:text-zinc-600">{s.total} run{s.total !== 1 ? "s" : ""} ({volumeSharePct}%)</span>
                    </div>
                    <div className="space-y-1">
                      {resolved > 0 ? (
                        <>
                          <Bar value={s.success} max={resolved} className={s.terminalFailure > 0 ? "bg-rose-500" : "bg-emerald-500"} />
                          <span className="text-[10.5px] font-mono text-zinc-400 dark:text-zinc-600">{rate}% of {resolved}</span>
                        </>
                      ) : (
                        <span className="text-[10.5px] font-mono text-zinc-300 dark:text-zinc-700">no resolved runs</span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-zinc-500 dark:text-zinc-500 text-right">{s.total > 0 ? fmtCents(avgCost) : "—"}</span>
                    <span className="text-xs font-mono text-zinc-500 dark:text-zinc-500 text-right">{avgDurationMs !== null ? fmtDuration(avgDurationMs) : "—"}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </Section>

        {/* Show-rate calibration */}
        <Section
          title="Show-rate prediction accuracy"
          caption={`Predicted show probability vs. what actually happened, last ${LOOKBACK_DAYS} days — points near the dashed diagonal mean the score is well-calibrated`}
        >
          <Card className="p-4">
            {calibrationBuckets.length < 2 ? (
              <EmptyState>
                Not enough calls with both a predicted score and a confirmed outcome yet to plot calibration. This fills in as brief outcomes get logged.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
                <div className="max-w-sm mx-auto md:mx-0">
                  <CalibrationChart buckets={calibrationBuckets} />
                </div>
                <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
                  <StatCard label="Calls scored" value={String(usableScored.length)} />
                  <StatCard label="Actual show rate" value={overallActualShowRate !== null ? `${overallActualShowRate}%` : "—"} />
                  <StatCard label="Brier score" value={brierScore !== null ? brierScore.toFixed(3) : "—"} sub="0 = perfect, 0.25 ≈ a coin flip" />
                </div>
              </div>
            )}
          </Card>
        </Section>

        {/* Win-Back recovery */}
        <Section title="Win-back recovery" caption={`Enrollments opened in the last ${LOOKBACK_DAYS} days, by current status`}>
          <Card className="p-4 space-y-4">
            {winBackTotal === 0 ? (
              <EmptyState>No win-back enrollments in the last {LOOKBACK_DAYS} days.</EmptyState>
            ) : (
              <>
                <SegmentedBar
                  total={winBackTotal}
                  segments={[
                    { label: "Rebooked", value: winBackCounts.rebooked, className: "bg-emerald-500" },
                    { label: "Active", value: winBackCounts.active, className: "bg-zinc-300 dark:bg-zinc-700" },
                    { label: "Lost", value: winBackCounts.lost, className: "bg-rose-500" },
                    { label: "Reply exited", value: winBackCounts.reply_exited, className: "bg-amber-500" },
                    { label: "Corrected", value: winBackCounts.corrected, className: "bg-zinc-400 dark:bg-zinc-600" },
                  ]}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <StatCard label="Recovery rate" value={recoveryRateOfResolved !== null ? `${recoveryRateOfResolved}%` : "—"} sub={`of ${winBackResolved} resolved (excludes still-active)`} />
                  <StatCard label="Median time to rebook" value={medianRecoveryDays !== null ? `${Math.round(medianRecoveryDays)}d` : "—"} sub="enrollment to rebooking" />
                  <StatCard label="Revenue attributed" value={revenueTotal > 0 ? fmtDollars(revenueTotal) : "—"} sub={revenuePeriodLabel} />
                </div>
              </>
            )}
          </Card>
        </Section>

        {/* Resolution analytics */}
        <Section title="How outcomes get resolved" caption={`Last ${LOOKBACK_DAYS} days`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="p-4 space-y-3">
              <p className="text-xs font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-600">Call outcome source</p>
              {outcomeTotal === 0 ? (
                <EmptyState>No call outcomes logged yet.</EmptyState>
              ) : (
                <SegmentedBar
                  total={outcomeTotal}
                  segments={[
                    { label: "Dashboard", value: sourceCounts.dashboard, className: "bg-ink dark:bg-ink-hover" },
                    { label: "Slack", value: sourceCounts.slack, className: "bg-zinc-400 dark:bg-zinc-600" },
                    { label: "Recall bot", value: sourceCounts.recall_bot, className: "bg-emerald-500" },
                    { label: "Auto-sweep", value: sourceCounts.auto_sweep, className: "bg-amber-500" },
                    ...(sourceCounts.other > 0 ? [{ label: "Other", value: sourceCounts.other, className: "bg-zinc-300 dark:bg-zinc-800" }] : []),
                  ]}
                />
              )}
            </Card>
            <Card className="p-4 space-y-3">
              <p className="text-xs font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-600">Time to human decision</p>
              {decidedActions.length === 0 && resolvedBlockers.length === 0 ? (
                <EmptyState>Nothing has been decided or resolved yet in this window.</EmptyState>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-zinc-500">Pending actions (approve/reject)</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {actionMedianMs !== null ? `${fmtDuration(actionMedianMs)} median` : "—"}
                      {actionP90Ms !== null && <span className="text-zinc-400 dark:text-zinc-600">{` · ${fmtDuration(actionP90Ms)} p90`}</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-zinc-500">Human blockers</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {blockerMedianMs !== null ? `${fmtDuration(blockerMedianMs)} median` : "—"}
                      {blockerP90Ms !== null && <span className="text-zinc-400 dark:text-zinc-600">{` · ${fmtDuration(blockerP90Ms)} p90`}</span>}
                    </span>
                  </div>
                  {(actionTypeMedians.size > 0 || blockerTypeMedians.size > 0) && (
                    <div className="pt-2 mt-2 border-t border-zinc-200 dark:border-zinc-900 space-y-1.5">
                      {[...actionTypeMedians.entries()].map(([type, arr]) => (
                        <div key={`a-${type}`} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-400 dark:text-zinc-600 font-mono">{type}</span>
                          <span className="font-mono text-zinc-600 dark:text-zinc-400">{fmtDuration(median(arr) ?? 0)} median ({arr.length})</span>
                        </div>
                      ))}
                      {[...blockerTypeMedians.entries()].map(([type, arr]) => (
                        <div key={`b-${type}`} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-400 dark:text-zinc-600 font-mono">{type}</span>
                          <span className="font-mono text-zinc-600 dark:text-zinc-400">{fmtDuration(median(arr) ?? 0)} median ({arr.length})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </Section>

        {/* Top objections */}
        <Section title="Top objections detected" caption={`From Recall.ai call transcripts, last ${LOOKBACK_DAYS} days`}>
          <Card>
            {topObjections.length === 0 ? (
              <EmptyState>No objections extracted from calls yet — this needs conversation intelligence sessions with a completed transcript.</EmptyState>
            ) : (
              <RankedList items={topObjections.map((o) => ({ label: o.display, count: o.count }))} unit="×" />
            )}
          </Card>
        </Section>

        {/* Recurring leaks */}
        <Section title="Recurring funnel leaks" caption={`Issues flagged medium/high severity across ${auditRunCount} Funnel Audit run${auditRunCount !== 1 ? "s" : ""}, last ${LOOKBACK_DAYS} days`}>
          <Card>
            {topLeaks.length === 0 ? (
              <EmptyState>No recurring medium/high-severity issues in this window.</EmptyState>
            ) : (
              <RankedList items={topLeaks} unit="×" />
            )}
          </Card>
        </Section>

        {/* Pile-On delivery */}
        <Section title="Pre-call sequence delivery" caption={`Email 1 personalization path, last ${LOOKBACK_DAYS} days`}>
          <Card className="p-4 space-y-3">
            {pileOnTotal === 0 ? (
              <EmptyState>No Pre-Call Sequence sends in this window.</EmptyState>
            ) : (
              <>
                <SegmentedBar
                  total={pileOnTotal}
                  segments={[
                    { label: "AI-personalized", value: pileOnHybrid, className: "bg-emerald-500" },
                    { label: "Template fallback", value: pileOnFallback, className: "bg-zinc-400 dark:bg-zinc-600" },
                  ]}
                />
                <p className="text-xs text-zinc-400 dark:text-zinc-600">
                  {pileOnErrors} send error{pileOnErrors !== 1 ? "s" : ""} ({pct(pileOnErrors, pileOnTotal) ?? 0}%) of {pileOnTotal} total sends
                </p>
              </>
            )}
          </Card>
        </Section>

        {/* Cross-client benchmark */}
        <Section title="Cross-client benchmark" caption="This account's latest audit numbers against anonymized peers in the same offer bucket (min. 20 contributing engagements)">
          <Card className="divide-y divide-zinc-200 dark:divide-zinc-900">
            {topBenchmarkComparisons.length === 0 ? (
              <EmptyState>
                No benchmark available yet — either this account&apos;s offer bucket (traffic temperature + price + vertical) hasn&apos;t cleared the 20-tenant
                anonymity floor, or no audit has run yet.
              </EmptyState>
            ) : (
              topBenchmarkComparisons.map((c, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">{c.metricName}</span>
                      <span className="text-zinc-400 dark:text-zinc-600 ml-2 text-xs truncate">{c.buyer} · {c.bucketDisplay}</span>
                    </div>
                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-500 shrink-0">
                      You: {c.current} · peer median: {c.p50} (n={c.sampleSize})
                    </span>
                  </div>
                  <RangeBar current={c.current} p25={c.p25} p50={c.p50} p75={c.p75} p90={c.p90} />
                </div>
              ))
            )}
          </Card>
        </Section>

        {/* Booking sync distribution */}
        <Section title="Booking sync">
          <Card className="p-4">
            {connectedCount === 0 ? (
              <EmptyState>No booking platforms connected yet.</EmptyState>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Direct webhook" value={String(webhookCount)} sub="instant sync" />
                <StatCard label="Auto-polling" value={String(pollingCount)} sub="5-min checks" />
                <StatCard label="Not configured" value={String(unsetCount)} sub="needs setup" />
                <StatCard label="Setup needed" value={String(setupNeededCount)} sub="see Settings → Booking Sync" />
              </div>
            )}
          </Card>
        </Section>
      </div>
    </div>
  );
}