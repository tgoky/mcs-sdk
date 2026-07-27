import { db } from "@/lib/db";
import { engagements, skillRuns, pendingActions, humanBlockers, type EngagementStack } from "@/models/schema";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SKILLS, SKILL_INFO, type SkillName } from "@/lib/copy";
import { needsWebhookSetupNudge } from "@/lib/booking-sync-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WINDOW_DAYS = 30;

/** Kept out of the page component body — the react-hooks/purity rule
 * flags any direct Date.now()/new Date() call inside a component's render,
 * server components included. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
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

/**
 * Real numbers only — every figure here comes straight from skill_runs,
 * pending_actions, human_blockers, and each engagement's stack. Nothing is
 * estimated or simulated; a skill that's never been run shows 0 runs, not
 * a placeholder chart.
 */
export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session.whopUserId) redirect("/api/auth/login");
  const whopUserId = session.whopUserId;

  const since = daysAgo(WINDOW_DAYS);

  const [runRows, engagementRows, openPending, openBlockers, resolvedActions, resolvedBlockers] = await Promise.all([
    db
      .select({
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        costInCents: skillRuns.costInCents,
        startedAt: skillRuns.startedAt,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), gte(skillRuns.startedAt, since))),

    db
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
      .from(engagements)
      .where(eq(engagements.whopUserId, whopUserId)),

    db
      .select({ id: pendingActions.id })
      .from(pendingActions)
      .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(pendingActions.status, "pending"))),

    db
      .select({ id: humanBlockers.id })
      .from(humanBlockers)
      .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(humanBlockers.status, "open"))),

    db
      .select({ id: pendingActions.id })
      .from(pendingActions)
      .innerJoin(engagements, eq(pendingActions.engagementId, engagements.engagementId))
      .where(and(
        eq(engagements.whopUserId, whopUserId),
        isNotNull(pendingActions.decidedAt),
        gte(pendingActions.decidedAt, since)
      )),

    db
      .select({ id: humanBlockers.id })
      .from(humanBlockers)
      .innerJoin(engagements, eq(humanBlockers.engagementId, engagements.engagementId))
      .where(and(
        eq(engagements.whopUserId, whopUserId),
        gte(humanBlockers.createdAt, since)
      )),
  ]);

  // Per-skill breakdown
  const perSkill: Record<SkillName, { total: number; success: number; failed: number; costCents: number }> = {
    "pin-down": { total: 0, success: 0, failed: 0, costCents: 0 },
    "pile-on": { total: 0, success: 0, failed: 0, costCents: 0 },
    "pre-call-read": { total: 0, success: 0, failed: 0, costCents: 0 },
    "win-back": { total: 0, success: 0, failed: 0, costCents: 0 },
    "leak-map": { total: 0, success: 0, failed: 0, costCents: 0 },
  };

  let totalRuns = 0;
  let totalSuccess = 0;
  let totalCostCents = 0;

  for (const run of runRows) {
    const skill = run.skillName as SkillName;
    totalRuns++;
    totalCostCents += run.costInCents ?? 0;
    if (run.status === "success") totalSuccess++;
    if (SKILLS.includes(skill)) {
      perSkill[skill].total++;
      perSkill[skill].costCents += run.costInCents ?? 0;
      if (run.status === "success") perSkill[skill].success++;
      if (run.status === "failed" || run.status === "timed_out") perSkill[skill].failed++;
    }
  }

  const successRate = totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 100) : null;
  const maxSkillRuns = Math.max(1, ...Object.values(perSkill).map((s) => s.total));

  // Booking sync distribution
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
    <div className="w-full space-y-8 px-6 py-6 transition-colors duration-200">
      <div>
        <h1 className="text-xl tracking-tight" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
          Analytics
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Last {WINDOW_DAYS} days, across every engagement on this account.
        </p>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total runs" value={String(totalRuns)} sub={`${engagementRows.length} engagement${engagementRows.length !== 1 ? "s" : ""}`} />
        <StatCard label="Success rate" value={successRate !== null ? `${successRate}%` : "—"} sub={totalRuns > 0 ? `${totalSuccess}/${totalRuns} runs` : "No runs yet"} />
        <StatCard label="Model spend" value={fmtCents(totalCostCents)} sub="across all skills" />
        <StatCard label="Queue open" value={String(openPending.length + openBlockers.length)} sub={`${resolvedActions.length + resolvedBlockers.length} resolved in ${WINDOW_DAYS}d`} />
      </div>

      {/* Per-skill breakdown */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">
          By skill
        </h2>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 divide-y divide-zinc-200 dark:divide-zinc-900">
          {SKILLS.map((skill) => {
            const s = perSkill[skill];
            const rate = s.total > 0 ? Math.round((s.success / s.total) * 100) : null;
            return (
              <div key={skill} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{SKILL_INFO[skill].name}</span>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-500">
                    {s.total} run{s.total !== 1 ? "s" : ""}
                    {rate !== null && <span className="ml-2">{rate}% success</span>}
                    {s.costCents > 0 && <span className="ml-2 text-zinc-400 dark:text-zinc-600">{fmtCents(s.costCents)}</span>}
                  </span>
                </div>
   <Bar value={s.total} max={maxSkillRuns} className={s.failed > 0 ? "bg-rose-500" : "bg-gold"} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Booking sync distribution */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">
          Booking sync
        </h2>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 p-4">
          {connectedCount === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">No booking platforms connected yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Direct webhook" value={String(webhookCount)} sub="instant sync" />
              <StatCard label="Auto-polling" value={String(pollingCount)} sub="5-min checks" />
              <StatCard label="Not configured" value={String(unsetCount)} sub="needs setup" />
              <StatCard label="Setup needed" value={String(setupNeededCount)} sub="see Settings → Booking Sync" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
