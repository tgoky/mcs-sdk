import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { engagements, skillRuns, pendingActions, humanBlockers, auditRunsLog } from "@/models/schema";
import { and, eq, gte, isNull } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { computeWinBackRevenueAttribution } from "@/features/win-back/server/revenue-attribution";
import { WORKER_IDS, WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { getPortfolioOutcomes } from "@/features/reports/server/portfolio-outcomes";
import { PortfolioOutcomesSection } from "@/components/analytics/portfolio-outcomes-section";
import { getCategorySignals, type CategoryFlaggedItem } from "@/features/reports/server/category-signals";
import { CategorySignalsSection } from "@/components/analytics/category-signals-section";

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
    <div className={`rounded-lg border border-zinc-200/70 dark:border-zinc-800/70 bg-transparent backdrop-blur-sm ${className}`}>
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


/**
 * Real numbers only — every figure here comes straight from skill_runs,
 * pending_actions, human_blockers, and audit_runs_log, plus whatever
 * getPortfolioOutcomes reads for the portfolio and category-signal
 * sections. Nothing is estimated or simulated; anything without enough
 * data yet says so instead of rendering a placeholder chart.
 */
export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session.whopUserId) redirect("/api/auth/login");
  const whopUserId = session.whopUserId;

  const since30 = daysAgo(TREND_DAYS);
  const since90 = daysAgo(LOOKBACK_DAYS);

  // Engagement roster is needed up front — the per-engagement
  // revenue-attribution calls below and the category-signal buyer
  // lookup both key off it.
  const engagementRows = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.deletedAt)));

  // Portfolio outcomes — independent of the operational query set below,
  // computed straight from the same engagement roster. See
  // portfolio-outcomes.ts for why this is a real per-account read, not a
  // recycled version of the infra-health numbers further down the page.
  const portfolioAccounts = await getPortfolioOutcomes(engagementRows.map((e) => ({ engagementId: e.engagementId, buyer: e.buyer })));

  const [runRows, pendingWindow, blockersWindow, auditWindow, revenueResults] = await Promise.all([
    db
      .select({ skillName: skillRuns.skillName, status: skillRuns.status, costInCents: skillRuns.costInCents, startedAt: skillRuns.startedAt, completedAt: skillRuns.completedAt })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(skillRuns.startedAt, since30), isNull(engagements.deletedAt))),

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

    // Still fetched — Funnel Audit's own resolver never produces a
    // trend-able block (worker-report-blocks.ts), so its "By category"
    // signal below is built straight from this raw audit data instead.
    db
      .select({ engagementId: auditRunsLog.engagementId, topIssues: auditRunsLog.topIssues, createdAt: auditRunsLog.createdAt })
      .from(auditRunsLog)
      .innerJoin(engagements, eq(auditRunsLog.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(auditRunsLog.createdAt, since90), isNull(engagements.deletedAt))),

    // Win-Back's own revenue-attribution module — deliberately left
    // fetched-but-unused here, see the "Dropped" note below.
    Promise.all(engagementRows.map((e) => computeWinBackRevenueAttribution(e.engagementId))),
  ]);

  // ── Skill comparison + top-line run stats (TREND_DAYS window) ─────────
  // Bug fix: this used to be keyed on SKILLS (Showtime's 5 only) — runRows
  // itself has no product filter, so every Reputation Manager run was
  // already being fetched and then silently discarded right here, the
  // one section on this page most in need of being both products' table.
  type SkillRunAgg = { total: number; success: number; terminalFailure: number; costCents: number; durationsMs: number[] };
  const perSkill = WORKER_IDS.reduce((acc, id) => {
    acc[id] = { total: 0, success: 0, terminalFailure: 0, costCents: 0, durationsMs: [] };
    return acc;
  }, {} as Record<WorkerId, SkillRunAgg>);

  let totalRuns = 0;

  const dayBuckets = new Map<string, { success: number; failed: number; other: number }>();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = daysAgo(i);
    dayBuckets.set(dayKey(d), { success: 0, failed: 0, other: 0 });
  }

  for (const run of runRows) {
    const isSuccess = run.status === "success";
    const isTerminalFailure = run.status === "failed" || run.status === "timed_out" || run.status === "cancelled";

    totalRuns++;

    const skill = run.skillName as WorkerId;
    if ((WORKER_IDS as string[]).includes(skill)) {
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

  // Dropped: a headline "revenue recovered/attributed" figure used to be
  // shown here, sourced from computeWinBackRevenueAttribution — a
  // price-parsing heuristic against offer text, not a real transaction.
  // This app has no billing/Stripe integration, so presenting that
  // estimate as a confident dollar figure read as fabricated data.
  // revenueResults is still fetched above (Win-Back's own module, left
  // as-is rather than touching the query destructure) but is
  // intentionally unused here now.

  // ── By-category signals ─────────────────────────────────────────────
  // Replaces the old per-skill hardcoded Sections (show-rate calibration,
  // win-back funnel, objections, funnel leaks, pile-on delivery,
  // cross-client benchmark, booking sync, and the separately-merged RM
  // signal sections) with one rollup bounded at the 5 fixed
  // WorkerCategory values. Every worker's tone-based signal
  // (win-back, pre-call-read, and all 5 RM skills) already flows through
  // portfolioAccounts' atRiskBlocks — no new queries needed for those.
  // Funnel Audit is the one exception: its resolver never produces a
  // block at all (worker-report-blocks.ts), so its signal is built here
  // from the same auditWindow rows the old "Recurring funnel leaks"
  // section used to read.
  const buyerById = new Map(engagementRows.map((e) => [e.engagementId, e.buyer]));
  const latestAuditByEngagement = new Map<string, { createdAt: Date; highCount: number }>();
  for (const row of auditWindow) {
    const issues = (row.topIssues ?? []) as { name: string; severity: "high" | "medium" | "low" | "none" }[];
    const highCount = issues.filter((i) => i.severity === "high").length;
    const existing = latestAuditByEngagement.get(row.engagementId);
    if (!existing || row.createdAt > existing.createdAt) {
      latestAuditByEngagement.set(row.engagementId, { createdAt: row.createdAt, highCount });
    }
  }
  const leakMapExtraFlags: CategoryFlaggedItem[] = [...latestAuditByEngagement.entries()]
    .filter(([, v]) => v.highCount > 0)
    .map(([engagementId, v]) => ({
      engagementId,
      buyer: buyerById.get(engagementId) ?? "Unknown",
      workerId: "leak-map" as WorkerId,
      label: "Funnel Audit",
      displayValue: `${v.highCount} high-severity issue${v.highCount > 1 ? "s" : ""}`,
    }));

  const categorySignals = getCategorySignals(portfolioAccounts, leakMapExtraFlags);

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
            Which accounts need a look, and whether the automation running them is healthy.
          </p>
        </div>

        <PortfolioOutcomesSection accounts={portfolioAccounts} />

        {/* Automation health — is the pipeline itself running, not
            whether an account is winning or losing. Legitimately useful
            to the operator, kept, just no longer the first thing on the
            page — see PortfolioOutcomesSection above for the primary,
            action-oriented view. */}
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            Automation health
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Last {TREND_DAYS} days of activity, and up to {LOOKBACK_DAYS} days of slower-moving signals, across every engagement on this account.
          </p>
        </div>

        {/* Daily activity trend */}
        <Section title="Daily activity" caption={`Run volume and outcome mix, last ${TREND_DAYS} days`}>
          <Card className="p-4">
            {totalRuns === 0 ? <EmptyState>No skill runs in the last {TREND_DAYS} days.</EmptyState> : <DailyActivityChart days={dailyActivity} />}
          </Card>
        </Section>

        {/* Cross-skill comparison — every worker across both products, busiest first */}
        <Section title="Skill comparison" caption={`Last ${TREND_DAYS} days — every skill across every installed product, busiest first`}>
          <Card>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-x-4 px-4 py-2 text-[10.5px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-600 border-b border-zinc-200 dark:border-zinc-900">
              <span>Skill</span>
              <span>Volume share</span>
              <span>Success rate</span>
              <span className="text-right">Avg cost</span>
              <span className="text-right">Avg duration</span>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-900">
              {[...WORKER_IDS]
                .sort((a, b) => perSkill[b].total - perSkill[a].total)
                .map((skill) => {
                  const s = perSkill[skill];
                  const resolved = s.success + s.terminalFailure;
                  const rate = pct(s.success, resolved);
                  const volumeSharePct = pct(s.total, totalRuns) ?? 0;
                  const avgCost = s.total > 0 ? s.costCents / s.total : 0;
                  const avgDurationMs = s.durationsMs.length > 0 ? s.durationsMs.reduce((a, b) => a + b, 0) / s.durationsMs.length : null;
                  return (
                    <div key={skill} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-x-4 px-4 py-3 items-center">
                      <span className="min-w-0 flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{WORKER_REGISTRY[skill].name}</span>
                        <span className="text-[9.5px] font-mono uppercase text-zinc-400 dark:text-zinc-600 shrink-0">
                          {WORKER_REGISTRY[skill].productId === "reputation-manager" ? "RM" : "ST"}
                        </span>
                      </span>
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

        {/* Per-skill deep dives (show-rate calibration, win-back funnel,
            objections, funnel leaks, pile-on delivery, cross-client
            benchmark, booking sync, and the old separately-merged RM
            signal sections) used to live here as hand-written Sections —
            replaced by CategorySignalsSection below, which is bounded at
            the 5 fixed WorkerCategory values instead of growing by one
            hardcoded block per worker. */}

        {/* Cross-product — pending actions / human blockers apply to
            either product's approval flows equally. */}
        <Section title="How outcomes get resolved" caption={`Last ${LOOKBACK_DAYS} days`}>
          <div className="grid grid-cols-1 gap-3">
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

        <CategorySignalsSection signals={categorySignals} />
      </div>
    </div>
  );
}