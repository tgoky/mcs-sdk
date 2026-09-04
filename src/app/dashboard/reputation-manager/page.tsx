import Link from "next/link";
import { AlertTriangle, ArrowRight, Plus, Shield, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, repIncidents, repEngineFindings, repTrustpilotReviews, repRedditMentions } from "@/models/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { getRepEnrolledEngagementIds } from "@/lib/rep-engagements";
import { REP_SKILL_MANIFEST, isRepSkillId, type RepSkillId } from "@/lib/rep-skill-manifest";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
 * added one), which made it look broken rather than early. The roster
 * itself now lives at its own rail destination
 * (/dashboard/engagements?product=reputation-manager, same as Showtime's
 * Clients), so this page's job is what a product's home page actually
 * does elsewhere in this app: report the workspace's real state — how
 * many clients, how many open incidents, how much monitoring has
 * actually happened — even when that state is all zeros, plus a way to
 * get to zero-clients' one real next step.
 */
export default async function ReputationManagerHomePage({ searchParams }: { searchParams: Promise<{ skill?: string }> }) {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  if (!(await isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "reputation-manager"))) {
    redirect("/dashboard/library");
  }
  const { skill } = await searchParams;
  const requestedSkill = skill ?? "";
  const selectedSkill: RepSkillId | null = isRepSkillId(requestedSkill) ? requestedSkill : null;

  const engagementIds = await getRepEnrolledEngagementIds(whopUserId, activeWorkspace.workspaceId);

  const [recentClients, openIncidents, recentIncidents, flaggedCounts] = await Promise.all([
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
      .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId), isNull(engagements.deletedAt)))
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
  ]);

  const clientsMonitored = engagementIds.length;

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Reputation Manager</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {selectedSkill ? `${REP_SKILL_MANIFEST[selectedSkill].name} across this workspace.` : `Monitoring overview for ${activeWorkspace.name}.`}
          </p>
        </div>
        <Link
          href="/dashboard/reputation-manager/new"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer border bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> New client
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatLink href="/dashboard/engagements?product=reputation-manager" label="Clients monitored" value={clientsMonitored} />
        <StatLink href="/dashboard/reputation-manager/incidents" label="Open incidents" value={openIncidents.length} tone="warn" />
        <StatLink href="/dashboard/reputation-manager/analytics" label="Flagged signals" value={flaggedCounts} tone="warn" />
      </div>

      {recentIncidents.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">Recent incidents</p>
            <Link href="/dashboard/reputation-manager/incidents" className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-1.5">
            {recentIncidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/dashboard/engagements/${incident.engagementId}`}
                className="flex items-center gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
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

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">Clients</p>
        {recentClients.length > 0 && (
          <Link href="/dashboard/engagements?product=reputation-manager" className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
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
            <Plus className="w-3.5 h-3.5" /> New client
          </Link>
        </div>
      ) : (
        <div className="space-y-1.5">
          {recentClients.map((row) => (
            <Link
              key={row.engagementId}
              href={`/dashboard/engagements/${row.engagementId}`}
              className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
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

      {clientsMonitored > 0 && openIncidents.length === 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> No open incidents across any monitored client.
        </p>
      )}
    </div>
  );
}
