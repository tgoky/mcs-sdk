import { db } from "@/lib/db";
import { engagements, skillRuns, artifacts, credentialsRefs, conversationIntelligenceSessions, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { EngagementPauseControl } from "./pause-control";
import { SkillsPanel } from "./skills-panel";
import { DeliverablesPanel, type BrandVoiceProfile } from "./deliverables-panel";
import { MasterRosterCalendar } from "./master-roster-calendar";
import { CallIntelligenceLog } from "./call-intelligence-log";
import { EngagementActionsMenu } from "./engagement-actions-menu";
import { RunRowActions } from "./run-row-actions";
import { getEngagementSkillStates } from "@/lib/engagement-skills";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  AlertCircle, 
  ArrowRight, 
  Server,
  ChevronLeft
} from "lucide-react";
import { computeBookingSyncStatus } from "@/lib/booking-sync-status";
import { BookingSyncChip } from "@/components/booking-sync-chip";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { getActiveWorkspace } from "@/lib/workspace";
import {

  SKILLS,
  skillName,
  phaseLabel,
  runStatusLabel,
  bookingPlatformLabel,
  emailPlatformLabel,
  type SkillName,

} from "@/lib/copy";

export const revalidate = 0;


function RunStatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "success" || s === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (s === "failed" || s === "error") return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
  if (s === "running" || s === "in_progress") return <Loader2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500 animate-spin shrink-0" />;
  return <AlertCircle className="w-4 h-4 text-zinc-400 dark:text-zinc-600 shrink-0" />;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}


export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId!);

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId!),
        // A client from a *different* workspace shouldn't be directly
        // reachable just because someone has an old link or bookmark to
        // it — 404s the same as if it belonged to another account, rather
        // than silently rendering across the workspace boundary.
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    );

  if (!engagement) notFound();

  const credentialRows = await db
    .select({ provider: credentialsRefs.provider, vaultId: credentialsRefs.vaultId })
    .from(credentialsRefs)
    .where(eq(credentialsRefs.engagementId, id));
  const vaultLinksByProvider = Object.fromEntries(
    credentialRows.map((r) => [r.provider, r.vaultId])
  );

  const runs = await db
    .select({
      id: skillRuns.id,
      skillName: skillRuns.skillName,
      status: skillRuns.status,
      phase: skillRuns.phase,
      errorMessage: skillRuns.errorMessage,
      startedAt: skillRuns.startedAt,
      completedAt: skillRuns.completedAt,
      stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
    })
    .from(skillRuns)
    .where(eq(skillRuns.engagementId, id))
    .orderBy(desc(skillRuns.startedAt));

  const stack = engagement.stack as Record<string, string> | null;
  const requireApproval = (engagement.stack as EngagementStack | null)?.require_approval_for_side_effects ?? false;
  const offerDetails = engagement.offerDetails as Record<string, string | boolean> | null;
  const skillStates = await getEngagementSkillStates(id);

  const runsBySkill = Object.fromEntries(
    SKILLS.map((skill) => [skill, runs.filter((r) => r.skillName === skill)])
  ) as Record<SkillName, typeof runs>;

  const artifactRows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.engagementId, id))
    .orderBy(desc(artifacts.createdAt));

  const conversationIntelligenceSessionRows = await db
    .select()
    .from(conversationIntelligenceSessions)
    .where(eq(conversationIntelligenceSessions.engagementId, id))
    .orderBy(desc(conversationIntelligenceSessions.createdAt))
    .limit(20);

  const conversationIntelligenceState = {
    enabled: (engagement.stack as EngagementStack | null)?.conversation_intelligence_provider === "recall_ai",
    lastProcessedAt: conversationIntelligenceSessionRows.find((s) => s.completedAt)?.completedAt?.toISOString(),
  };

  const ARTIFACT_TYPE_LABELS: Record<string, string> = {
    recovery_cadence: "Win-Back recovery cadence",
    long_term_nurture: "Win-Back long-term nurture",
  };

  const OWNER_LABELS: Record<string, string> = {
    mudd_ventures: "Runs on our infra",
    buyer: "Exported to buyer's infra",
  };

  // Cleaned Offer Metadata values
  const offerName = String(offerDetails?.name || "").trim() || "Unspecified Offer";
  const offerPrice = String(offerDetails?.price || "").trim();
  const offerIcp = String(offerDetails?.icp || "").trim();

  return (
    <div className="relative min-h-screen w-full mx-auto tracking-tight antialiased px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200 overflow-hidden pb-10">
      
      {/* --- HYPER-MICRO TIGHT DOT GRID (0.5px / 6px grid) --- */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" 
        aria-hidden="true"
      />

      {/* --- PAGE CONTENT --- */}
      <div className="relative z-10 space-y-6">

        {/* Header Section */}
     {/* Header Section */}
        <div className="space-y-4 border-b border-zinc-200 dark:border-zinc-800/80 pb-5">
          <SetBreadcrumbLabel label={engagement.buyer} />

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-3">
              {/* Circular Back Button & Client Name in the same horizontal row */}
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard/engagements"
                  className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
                  aria-label="Back to All Clients"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Link>
                <div>
                  <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{engagement.buyer}</h1>
                  <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">{engagement.engagementId}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 font-mono">
                <span className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/60 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800">
                  {bookingPlatformLabel(stack?.booking_platform)}
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/60 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800">
                  {emailPlatformLabel(stack?.email_platform)}
                </span>
                {offerDetails?.traffic_temperature && (
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/60 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 capitalize">
                    {String(offerDetails.traffic_temperature)} traffic
                  </span>
                )}

                {/* Status Chip */}
                {stack?.booking_platform && (
                  <BookingSyncChip
                    status={computeBookingSyncStatus(engagement.engagementId, engagement.stack as EngagementStack | null)}
                    className="ml-1"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <EngagementPauseControl
                  engagementId={engagement.engagementId}
                  initialPausedAt={engagement.pausedAt ? engagement.pausedAt.toISOString() : null}
                  initialPausedReason={engagement.pausedReason}
                />
                <EngagementActionsMenu
                  engagementId={engagement.engagementId}
                  buyerName={engagement.buyer}
                  initialStack={engagement.stack as EngagementStack | null}
                  bookingPlatform={stack?.booking_platform}
                  emailPlatform={stack?.email_platform}
                  vaultLinksByProvider={vaultLinksByProvider}
                  initialRequireApproval={requireApproval}
                  initialDeletedAt={engagement.deletedAt ? engagement.deletedAt.toISOString() : null}
                />
              </div>
            </div>
          </div>

          {/* Offer Details */}
          {offerDetails && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-xs p-5 shadow-xs overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                <div className="flex-1 space-y-4 min-w-0">
                  <div className="space-y-1">
                    <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 select-none">
                      Offer
                    </p>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
                      {offerName}
                    </h2>
                  </div>

                  {offerIcp && (
                    <div className="space-y-1 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60">
                      <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 select-none">
                        Targeting
                      </p>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 leading-relaxed">
                        {offerIcp}
                      </p>
                    </div>
                  )}
                </div>

                <div className="shrink-0 self-start">
                  <div className="flex flex-col items-center justify-center px-5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 min-w-[100px]">
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 select-none">
                      Price
                    </span>
                    <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums mt-0.5">
                      {offerPrice ? `$${offerPrice}` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

       <SkillsPanel
  engagementId={engagement.engagementId}
  initialStates={skillStates}
  runsBySkill={runsBySkill}
  isPaused={Boolean(engagement.pausedAt)}
/>

        {engagement.pausedAt && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-xs font-mono text-amber-800 dark:text-amber-400">
            This client is paused — nightly briefs, leak map, win-back, weekly metrics, and booking polling are all
            skipping it.{engagement.pausedReason ? ` Reason: ${engagement.pausedReason}` : ""} Manual &quot;Run&quot; buttons
            below still work if you need to test something.
          </div>
        )}

        {/* Modules Selector Grid */}
       

        {/* SINGLE UNIFIED SCHEDULE HUB (Month, Day Timeline, List, Board) */}
        <MasterRosterCalendar engagementId={id} />

        <DeliverablesPanel
          engagementId={id}
          discoveryPrefill={engagement.discoveryPrefill}
          voiceScrapeArtifacts={engagement.voiceScrapeArtifacts}
          brandVoiceProfile={engagement.brandVoiceProfile as BrandVoiceProfile}
          adCreativeBriefs={engagement.adCreativeBriefs}
          pinDownScriptPack={engagement.pinDownScriptPack}
          pinDownPageAudit={engagement.pinDownPageAudit}
          conversationIntelligence={conversationIntelligenceState}
        />

        {(conversationIntelligenceState.enabled || conversationIntelligenceSessionRows.length > 0) && (
          <CallIntelligenceLog sessions={conversationIntelligenceSessionRows} />
        )}

        {/* Runtime Ownership */}
        {artifactRows.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" /> Runtime Ownership
            </h2>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-xs p-4 space-y-2 shadow-xs">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-mono">
                What runs on our infrastructure vs. what would move to {engagement.buyer}&apos;s own systems under an export.
              </p>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/40">
                {artifactRows.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2 text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                      {ARTIFACT_TYPE_LABELS[a.artifactType] ?? a.artifactType}
                    </span>
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                        a.owner === "buyer"
                          ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40"
                          : "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                      }`}
                    >
                      {OWNER_LABELS[a.owner] ?? a.owner}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Run History */}
        {runs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">Run History</h2>
              {runs.length > 20 && (
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">Showing 20 most recent</span>
              )}
            </div>

            <div className="w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-transparent transition-colors">
              <ol className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                {runs.slice(0, 20).map((run) => {
                  const isFailed = run.status.toLowerCase() === "failed";

                  return (
                    <li key={run.id} className="group relative">
                      <Link
                        href={`/dashboard/runs/${run.id}`}
                        className="absolute inset-0 z-10"
                        aria-label={`View run details for ${skillName(run.skillName)}`}
                      />
                      <div className="relative flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <RunStatusIcon status={run.status} />
                        <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
                                {skillName(run.skillName)}
                              </span>
                              <span className="text-zinc-600 dark:text-zinc-400 text-xs font-normal font-mono">
                                {runStatusLabel(run.status)}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono mt-0.5 text-zinc-400 dark:text-zinc-500">
                              {phaseLabel(run.phase)}{run.stepCount > 0 ? ` · ${run.stepCount} step${run.stepCount === 1 ? "" : "s"}` : ""}
                            </div>
                            {isFailed && run.errorMessage && (
                              <div className="text-[11px] font-mono text-rose-500/90 dark:text-rose-400/80 mt-1 leading-relaxed line-clamp-2 max-w-xl">
                                {run.errorMessage}
                              </div>
                            )}
                          </div>

                          <div
                            className="shrink-0 flex items-center gap-2 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 pt-0.5"
                            title={new Date(run.startedAt).toLocaleString()}
                          >
                            <SquishySkillBadge skill={run.skillName} size={22} enabled={true} />
                            <span>{relativeTime(String(run.startedAt))}</span>
                            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                            <RunRowActions
                              runId={run.id}
                              engagementId={engagement.engagementId}
                              skillName={run.skillName}
                              skillLabel={skillName(run.skillName)}
                              status={run.status}
                            />
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}

        {runs.length === 0 && (
          <div className="h-32 border border-dashed border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-transparent rounded-xl flex flex-col items-center justify-center space-y-1.5 transition-colors">
            <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500">No modules have run yet for this client.</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">Pick a module above to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}