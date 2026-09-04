import Link from "next/link";
import { AlertTriangle, ArrowRight, Plus, Shield, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import {
  engagements,
  repIdentityGraphs,
  repIncidents,
  repEngineFindings,
  repTrustpilotReviews,
  repRedditMentions,
  skillRuns,
} from "@/models/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { getRepEnrolledEngagementIds } from "@/lib/rep-engagements";
import { getQueueItems } from "@/lib/queue";
import { skillIdsForProduct } from "@/lib/product-catalog";
import { latestStepLabel } from "@/lib/run-display";
import { QueuePanel } from "../queue-panel";
import { LiveExecutionFeed } from "../live-execution-feed";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REP_SKILL_IDS_ARR = [...skillIdsForProduct("reputation-manager")];

function StatLink({ href, label, value, tone }: { href: string; label: string; value: number; tone?: "warn" }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    >
      <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone === "warn" && value > 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-900 dark:text-zinc-100"}`}>
        {value}
      </p>
    </Link>
  );
}

/**
 * Reputation Manager's dashboard — the page behind its own primary-rail
 * badge. Used to just be the bare client roster (a page that read as
 * "No clients set up yet" and nothing else the moment a workspace hadn't
 * added one) inside a narrow centered card, unlike every other real page
 * in this app. Rebuilt on the same full-width shell and the same
 * QueuePanel/LiveExecutionFeed components Work's own dashboard
 * (/dashboard/page.tsx) and the product-scoped Queue/Executions pages
 * already use — scoped here to REP_SKILL_IDS the same way
 * /dashboard/queue?product=reputation-manager and
 * /dashboard/runs?product=reputation-manager already scope theirs, so
 * this is a real "quick look" and not a second, differently-shaped
 * queue/activity implementation.
 */
export default async function ReputationManagerHomePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const workspaceId = activeWorkspace.workspaceId;
  if (!(await isPackageInstalledInWorkspace(workspaceId, "reputation-manager"))) {
    redirect("/dashboard/library");
  }

  const engagementIds = await getRepEnrolledEngagementIds(whopUserId, workspaceId);

  const [recentClients, openIncidents, recentIncidents, flaggedCounts, queueItems, clientRows, runRows] = await Promise.all([
    db
      .select({
        engagementId: engagements.engagementId,
        buyer: engagements.buyer,
        label: engagements.label,
        operatorName: repIdentityGraphs.operatorName,
        entityCount: repIdentityGraphs.entities,
        createdAt: repIdentityGraphs.createdAt,
      })
      .from(repIdentityGraphs)
      .innerJoin(engagements, eq(repIdentityGraphs.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt)))
      .orderBy(desc(repIdentityGraphs.createdAt))
      .limit(5),
    engagementIds.length
      ? db.select({ id: repIncidents.id }).from(repIncidents).where(and(inArray(repIncidents.engagementId, engagementIds), eq(repIncidents.status, "open")))
      : [],
    engagementIds.length
      ? db
          .select({ id: repIncidents.id, engagementId: repIncidents.engagementId, severityScore: repIncidents.severityScore, summary: repIncidents.summary, status: repIncidents.status, buyer: engagements.buyer })
          .from(repIncidents)
          .innerJoin(engagements, eq(engagements.engagementId, repIncidents.engagementId))
          .where(inArray(repIncidents.engagementId, engagementIds))
          .orderBy(desc(repIncidents.declaredAt))
          .limit(3)
      : [],
    engagementIds.length
      ? Promise.all([
          db.select({ flagged: repEngineFindings.flagged }).from(repEngineFindings).where(inArray(repEngineFindings.engagementId, engagementIds)),
          db.select({ flagged: repTrustpilotReviews.flagged }).from(repTrustpilotReviews).where(inArray(repTrustpilotReviews.engagementId, engagementIds)),
          db.select({ flagged: repRedditMentions.flagged }).from(repRedditMentions).where(inArray(repRedditMentions.engagementId, engagementIds)),
        ]).then(([a, b, c]) => [...a, ...b, ...c].filter((r) => r.flagged).length)
      : 0,
    getQueueItems(whopUserId, workspaceId, { skillIds: REP_SKILL_IDS_ARR }),
    db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, pausedAt: engagements.pausedAt })
      .from(engagements)
      .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt))),
    db
      .select({
        id: skillRuns.id,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        phase: skillRuns.phase,
        startedAt: skillRuns.startedAt,
        completedAt: skillRuns.completedAt,
        engagementId: skillRuns.engagementId,
        buyerName: engagements.buyer,
        engagementPausedAt: engagements.pausedAt,
        errorMessage: skillRuns.errorMessage,
        steps: skillRuns.steps,
        stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
        summary: skillRuns.summary,
      })
      .from(skillRuns)
      .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
      .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), inArray(skillRuns.skillName, REP_SKILL_IDS_ARR)))
      .orderBy(desc(skillRuns.startedAt))
      .limit(8),
  ]);

  const clientsMonitored = engagementIds.length;
  const clients = clientRows.map((c) => ({ engagementId: c.engagementId, buyer: c.buyer, pausedAt: c.pausedAt ? c.pausedAt.toISOString() : null }));
  const runs = runRows.map(({ steps, startedAt, completedAt, engagementPausedAt, ...rest }) => ({
    ...rest,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt ? completedAt.toISOString() : null,
    engagementPausedAt: engagementPausedAt ? engagementPausedAt.toISOString() : null,
    subjectLabel: latestStepLabel(steps),
  }));

  return (
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden pb-10">
      <div className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" aria-hidden="true" />

      <div className="relative z-10 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 dark:border-zinc-800/80 pb-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Reputation Manager</h1>
            <p className="text-sm font-normal text-zinc-500 dark:text-zinc-400">Monitoring overview for {activeWorkspace.name}.</p>
          </div>
          <Link
            href="/dashboard/reputation-manager/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" /> Add Client
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatLink href="/dashboard/engagements?product=reputation-manager" label="Clients monitored" value={clientsMonitored} />
          <StatLink href="/dashboard/reputation-manager/incidents" label="Open incidents" value={openIncidents.length} tone="warn" />
          <StatLink href="/dashboard/reputation-manager/analytics" label="Flagged signals" value={flaggedCounts} tone="warn" />
        </div>

        {recentIncidents.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">Recent incidents</p>
              <Link href="/dashboard/reputation-manager/incidents" className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-1.5">
              {recentIncidents.map((incident) => (
                <Link
                  key={incident.id}
                  href={`/dashboard/engagements/${incident.engagementId}`}
                  className="flex items-center gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{incident.buyer}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{incident.summary}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        {clientsMonitored > 0 && openIncidents.length === 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> No open incidents across any monitored client.
          </p>
        )}

        <div className="pt-2">
          <QueuePanel initialItems={queueItems} clients={clients} title="Queue" viewAllHref="/dashboard/queue?product=reputation-manager" apiUrl="/api/queue?product=reputation-manager" />
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">Executions</p>
            {runs.length > 0 && (
              <Link href="/dashboard/runs?product=reputation-manager" className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors">
                View all
              </Link>
            )}
          </div>
          <div className="pt-1 border-t border-zinc-200/60 dark:border-zinc-900/20">
            <LiveExecutionFeed initialRuns={runs} storageKey="reputation-manager" apiUrl="/api/skill-runs/recent?product=reputation-manager" />
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-900">
          <div className="flex items-center justify-between mb-2 pt-2">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">Clients</p>
            {recentClients.length > 0 && (
              <Link href="/dashboard/engagements?product=reputation-manager" className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          {recentClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
              <Shield className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                Set up identity monitoring for a client to get started — brand new, or one you&apos;re already working
                with elsewhere.
              </p>
              <Link
                href="/dashboard/reputation-manager/new"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Plus className="w-3.5 h-3.5" /> Add Client
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentClients.map((row) => (
                <Link
                  key={row.engagementId}
                  href={`/dashboard/engagements/${row.engagementId}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{row.buyer}</p>
                      {row.label && <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{row.label}</span>}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Operator: {row.operatorName}
                      {Array.isArray(row.entityCount) && row.entityCount.length > 0
                        ? ` · ${row.entityCount.length} entit${row.entityCount.length === 1 ? "y" : "ies"}`
                        : ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
