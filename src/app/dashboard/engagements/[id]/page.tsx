import { db } from "@/lib/db";
import { engagements, skillRuns, artifacts, credentialsRefs, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TriggerSkillButton } from "./trigger-skill-button";
import { EngagementPauseControl } from "./pause-control";
import { ApprovalModeToggle } from "./approval-mode/approval-mode-toggle";
import { SkillsPanel } from "./skills-panel";
import { DeliverablesPanel, type BrandVoiceProfile } from "./deliverables-panel";
import { EditStackSettings } from "./edit-stack-settings";
import { UpdateCredentialsForm } from "./update-credentials-form";
import { DeleteClientSection } from "./delete-client-section";
import { getEngagementSkillStates } from "@/lib/engagement-skills";
import { CheckCircle2, XCircle, Loader2, AlertCircle, ArrowRight, Server, DollarSign } from "lucide-react";
import { computeWinBackRevenueAttribution } from "@/features/win-back/server/revenue-attribution";
import { computeBookingSyncStatus } from "@/lib/booking-sync-status";
import { BookingSyncStatusCard } from "@/components/booking-sync-status-card";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import {
  SKILL_INFO,
  SKILLS,
  skillName,
  phaseLabel,
  runStatusLabel,
  bookingPlatformLabel,
  emailPlatformLabel,
  type SkillName,
  type ModuleStatus,
  MODULE_STATUS_LABELS,
  MODULE_STATUS_COLORS,
} from "@/lib/copy";

export const revalidate = 0;

function deriveModuleStatus(runs: { status: string }[]): ModuleStatus {
  if (runs.length === 0) return "not_run";
  const s = runs[0].status.toLowerCase();
  if (s === "success") return "live";
  if (s === "failed") return "failed";
  return "not_run";
}

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

function PhaseTag({ phase, status }: { phase: string | null; status: string }) {
  const label = phaseLabel(phase);
  const isRunning = status.toLowerCase() === "running";
  return (
    <span className={`text-[11px] font-mono tracking-tight ${isRunning ? "text-zinc-600 dark:text-zinc-300 italic animate-pulse" : "text-zinc-400 dark:text-zinc-500"}`}>
      {label}
    </span>
  );
}

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  const { id } = await params;

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId!)));

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

  const ARTIFACT_TYPE_LABELS: Record<string, string> = {
    recovery_cadence: "Win-Back recovery cadence",
    long_term_nurture: "Win-Back long-term nurture",
  };

  const OWNER_LABELS: Record<string, string> = {
    mudd_ventures: "Runs on our infra",
    buyer: "Exported to buyer's infra",
  };

  const revenueAttribution = await computeWinBackRevenueAttribution(id);

  return (
    <div className="space-y-6 w-full mx-auto tracking-tight antialiased px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">

      <div className="space-y-4 border-b border-zinc-200 dark:border-zinc-900 pb-5">
        <SetBreadcrumbLabel label={engagement.buyer} />
        <BackLink href="/dashboard/engagements" label="All Clients" />

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{engagement.buyer}</h1>
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">{engagement.engagementId}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 font-mono">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-900/60">
                {bookingPlatformLabel(stack?.booking_platform)}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-900/60">
                {emailPlatformLabel(stack?.email_platform)}
              </span>
              {offerDetails?.traffic_temperature && (
                <span className="text-[11px] text-zinc-500 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-900/60 capitalize">
                  {String(offerDetails.traffic_temperature)} traffic
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <EngagementPauseControl
              engagementId={engagement.engagementId}
              initialPausedAt={engagement.pausedAt ? engagement.pausedAt.toISOString() : null}
              initialPausedReason={engagement.pausedReason}
            />
            <ApprovalModeToggle
              engagementId={engagement.engagementId}
              initialRequireApproval={requireApproval}
            />
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/10 p-3 space-y-3">
          <p className="text-[10px] font-mono font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">
            Client management
          </p>
          <div className="flex flex-wrap gap-2">
            <div id="stack-settings" className="scroll-mt-24">
              <EditStackSettings
                engagementId={engagement.engagementId}
                initialStack={engagement.stack as EngagementStack | null}
              />
            </div>
            <div id="update-credentials" className="scroll-mt-24">
              <UpdateCredentialsForm
                engagementId={engagement.engagementId}
                bookingPlatform={stack?.booking_platform}
                emailPlatform={stack?.email_platform}
                vaultLinksByProvider={vaultLinksByProvider}
              />
            </div>
          </div>
          <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-900/70">
            <DeleteClientSection
              engagementId={engagement.engagementId}
              buyerName={engagement.buyer}
              initialDeletedAt={engagement.deletedAt ? engagement.deletedAt.toISOString() : null}
            />
          </div>
        </div>
      </div>

      <SkillsPanel engagementId={engagement.engagementId} initialStates={skillStates} />

      {engagement.pausedAt && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 text-xs font-mono text-amber-800 dark:text-amber-400">
          This client is paused — nightly briefs, leak map, win-back, weekly metrics, and booking polling are all
          skipping it.{engagement.pausedReason ? ` Reason: ${engagement.pausedReason}` : ""} Manual &quot;Run&quot; buttons
          below still work if you need to test something.
        </div>
      )}

      {offerDetails && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Offer", value: String(offerDetails.name ?? "—") },
            { label: "Price", value: String(offerDetails.price ?? "—") },
            { label: "Ideal Customer", value: String(offerDetails.icp ?? "—") },
            { label: "AI Personalization", value: offerDetails.hybrid_mode_enabled ? "On" : "Off" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/20 p-3 space-y-1 shadow-sm">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono uppercase tracking-wider">{label}</p>
              <p className="text-xs text-zinc-800 dark:text-zinc-300 font-semibold leading-snug">{value}</p>
            </div>
          ))}
        </div>
      )}

      {stack?.booking_platform && (
        <BookingSyncStatusCard
          engagementId={engagement.engagementId}
          status={computeBookingSyncStatus(engagement.engagementId, engagement.stack as EngagementStack | null)}
        />
      )}

      <div className="space-y-2">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">Modules</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SKILLS.map((skill) => {
            const info = SKILL_INFO[skill];
            const skillRunList = runsBySkill[skill];
            const status = deriveModuleStatus(skillRunList);
            const latestRun = skillRunList[0] ?? null;

            return (
              <div key={skill} className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 flex flex-col justify-between min-h-[190px] shadow-sm">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{info.name}</p>
                      <p className="text-[11px] font-normal text-zinc-500 dark:text-zinc-500 leading-snug">{info.description}</p>
                    </div>
                    <span className={`text-[11px] font-mono font-bold shrink-0 p-1 bg-zinc-100 dark:bg-zinc-900/40 rounded border border-zinc-200/60 dark:border-zinc-800/40 ml-2 ${MODULE_STATUS_COLORS[status]}`}>
                      {MODULE_STATUS_LABELS[status]}
                    </span>
                  </div>

                  {latestRun && (
                    <div className="border-t border-zinc-200 dark:border-zinc-900/50 pt-2.5 space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <p className="text-zinc-400 dark:text-zinc-600">Last execution</p>
                        <Link
                          href={`/dashboard/runs/${latestRun.id}`}
                          className="text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors flex items-center gap-0.5 font-bold"
                        >
                          View run <ArrowRight className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                      <div className="flex items-center justify-between">
                        <PhaseTag phase={latestRun.phase} status={latestRun.status} />
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono">
                          {new Date(latestRun.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      {latestRun.status.toLowerCase() === "failed" && latestRun.errorMessage && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400/80 leading-snug pt-0.5 font-mono break-all">
                          {latestRun.errorMessage.length < 100
                            ? latestRun.errorMessage
                            : latestRun.errorMessage.slice(0, 97) + "…"}
                        </p>
                      )}
                      {latestRun.status.toLowerCase() === "failed" && !latestRun.errorMessage && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400/80 leading-snug pt-0.5 font-medium">
                          This module needs attention. Click &quot;View run&quot; for details.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-900/40 mt-3">
                  <TriggerSkillButton
                    engagementId={engagement.engagementId}
                    skillName={skill}
                    label={`Run ${info.name}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <DeliverablesPanel
        discoveryPrefill={engagement.discoveryPrefill}
        voiceScrapeArtifacts={engagement.voiceScrapeArtifacts}
        brandVoiceProfile={engagement.brandVoiceProfile as BrandVoiceProfile}
        adCreativeBriefs={engagement.adCreativeBriefs}
        pinDownScriptPack={engagement.pinDownScriptPack}
        pinDownPageAudit={engagement.pinDownPageAudit}
      />

      <div className="space-y-2">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5" /> Win-Back Revenue Recovered — {revenueAttribution.periodLabel}
        </h2>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono uppercase tracking-wider">Recovered</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {revenueAttribution.recoveredCount}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono uppercase tracking-wider">Revenue</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                ${revenueAttribution.totalRevenue.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono uppercase tracking-wider">Avg / recovery</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                ${Math.round(revenueAttribution.averageRecoveryValue).toLocaleString()}
              </p>
            </div>
          </div>
          {revenueAttribution.recoveredEnrollments.length > 0 ? (
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-900/40 divide-y divide-zinc-100 dark:divide-zinc-900/50">
              {revenueAttribution.recoveredEnrollments.slice(0, 10).map((r) => (
                <div key={r.prospectEmail} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">{r.prospectName ?? r.prospectEmail}</span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono">
                    {new Date(r.rebookedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-900/40 text-[11px] text-zinc-400 dark:text-zinc-600 font-mono">
              No recoveries attributed yet this period — this fills in automatically as Win-Back rebooks prospects.
            </p>
          )}
        </div>
      </div>

      {artifactRows.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" /> Runtime Ownership
          </h2>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-2 shadow-sm">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-500 leading-relaxed font-mono">
              What runs on our infrastructure vs. what would move to {engagement.buyer}&apos;s own systems under an export.
            </p>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-900/50">
              {artifactRows.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 text-xs">
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                    {ARTIFACT_TYPE_LABELS[a.artifactType] ?? a.artifactType}
                  </span>
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                      a.owner === "buyer"
                        ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40"
                        : "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/40"
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

      {runs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">Run History</h2>
            {runs.length > 20 && (
              <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600">Showing 20 most recent</span>
            )}
          </div>

          <div className="w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/10 shadow-sm transition-colors">
            <ol className="divide-y divide-zinc-200 dark:divide-zinc-900/50">
              {runs.slice(0, 20).map((run) => {
                const isFailed = run.status.toLowerCase() === "failed";
                const isRunning = run.status.toLowerCase() === "running" || run.status.toLowerCase() === "in_progress";
                const pillClass = isFailed
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : isRunning
                    ? "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400"
                    : run.status.toLowerCase() === "success"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400";

                return (
                  <li key={run.id} className="group relative">
                    <Link
                      href={`/dashboard/runs/${run.id}`}
                      className="absolute inset-0 z-10"
                      aria-label={`View run details for ${skillName(run.skillName)}`}
                    />
                    <div className="relative flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                      <RunStatusIcon status={run.status} />
                      <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
                              {skillName(run.skillName)}
                            </span>
                            <span className={`text-[10px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${pillClass}`}>
                              {runStatusLabel(run.status)}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono mt-0.5 text-zinc-400 dark:text-zinc-600">
                            {phaseLabel(run.phase)}{run.stepCount > 0 ? ` · ${run.stepCount} step${run.stepCount === 1 ? "" : "s"}` : ""}
                          </div>
                          {isFailed && run.errorMessage && (
                            <div className="text-[11px] font-mono text-rose-500/90 dark:text-rose-400/80 mt-1 leading-relaxed line-clamp-2 max-w-xl">
                              {run.errorMessage}
                            </div>
                          )}
                        </div>
                        <div
                          className="shrink-0 flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 dark:text-zinc-600 pt-0.5"
                          title={new Date(run.startedAt).toLocaleString()}
                        >
                          {relativeTime(String(run.startedAt))}
                          <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
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
        <div className="h-32 border border-dashed border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-transparent rounded-lg flex flex-col items-center justify-center space-y-1.5 transition-colors">
          <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500">No modules have run yet for this client.</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">Pick a module above to get started.</p>
        </div>
      )}
    </div>
  );
}