import { db } from "@/lib/db";
import { engagements, skillRuns, artifacts, credentialsRefs, conversationIntelligenceSessions, repIdentityGraphs, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { EngagementPauseControl } from "./pause-control";
import { WorkersPanel } from "./workers-panel";
import { RepAuditLogPanel } from "./rep-audit-log-panel";
import { MasterRosterCalendar } from "./master-roster-calendar";
import { CallIntelligenceLog } from "./call-intelligence-log";
import { EngagementActionsMenu } from "./engagement-actions-menu";
import { RunRowActions } from "./run-row-actions";
import { RunHistoryPanel } from "./run-history-panel";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getRecentAuditEvents } from "@/features/reputation-manager/server/audit-log";
import { getInstalledPackagesByWorkspace } from "@/lib/workspace";
import { REP_SKILL_IDS, type RepSkillId } from "@/lib/rep-skill-manifest";
import type { WorkerId } from "@/lib/worker-registry";
import {
  ArrowRight,
  Server,
  ChevronLeft,
  Megaphone
} from "lucide-react";
import { computeBookingSyncStatus } from "@/lib/booking-sync-status";
import { BookingSyncChip } from "@/components/booking-sync-chip";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { getActiveWorkspace } from "@/lib/workspace";
import type { ReportPeriod } from "@/features/reports/server/report-service";
import { getReportBlocksForEngagement, attachTrends, type ReportBlockWithTrend } from "@/lib/worker-report-blocks";
import { isProductOnboarded, isProductOnboardingSkipDismissed } from "@/lib/product-onboarding";
import { getMissingRequiredFields, type MissingField } from "@/lib/worker-config-completeness";
import { WORKER_REGISTRY } from "@/lib/worker-registry";
import { PRODUCT_IDS, type ProductId } from "@/lib/product-catalog";
import { getPriorSnapshot } from "@/lib/client-metric-snapshots";
import { startOfWeek } from "@/lib/dashboard-stats";
import { getRecentAccountReviews } from "@/features/reports/server/account-advisor";
import { DynamicClientReport } from "@/components/reports/dynamic-client-report";
import { AccountAdvisorPanel } from "@/components/reports/account-advisor-panel";
import {
  SKILLS,
  bookingPlatformLabel,
  emailPlatformLabel,
  type SkillName,
} from "@/lib/copy";
import { latestStepLabel } from "@/lib/run-display";

export const revalidate = 0;

const RUN_HISTORY_LIMIT = 300;

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

  const runsRaw = await db
    .select({
      id: skillRuns.id,
      skillName: skillRuns.skillName,
      status: skillRuns.status,
      phase: skillRuns.phase,
      errorMessage: skillRuns.errorMessage,
      startedAt: skillRuns.startedAt,
      completedAt: skillRuns.completedAt,
      steps: skillRuns.steps,
      stepCount: sql<number>`coalesce(jsonb_array_length(${skillRuns.steps}), 0)`,
    })
    .from(skillRuns)
    .where(eq(skillRuns.engagementId, id))
    .orderBy(desc(skillRuns.startedAt))
    // Bounded: this page shows recent history (full history is on the
    // runs page), and each row's steps JSON can be large.
    .limit(RUN_HISTORY_LIMIT);

  const runHistoryCapped = runsRaw.length === RUN_HISTORY_LIMIT;
  // steps is only needed for the label; it isn't passed to the client.
  const runs = runsRaw.map(({ steps, ...r }) => ({ ...r, subjectLabel: latestStepLabel(steps) }));

  const stack = engagement.stack as Record<string, string> | null;
  const requireApproval = (engagement.stack as EngagementStack | null)?.require_approval_for_side_effects ?? false;
  const offerDetails = engagement.offerDetails as Record<string, string | boolean> | null;

  // Whether Reputation Manager's own worker cards belong on this page —
  // its identity graph existing is the real signal (same one the
  // WorkersPanel-replaced RepSkillsPanel used), not just "is the product
  // installed workspace-wide," since installing it and actually running
  // Identity Setup for this specific client are different things.
  const installedProductIds = (
    await getInstalledPackagesByWorkspace([activeWorkspace.workspaceId])
  ).get(activeWorkspace.workspaceId) ?? [];

  const [repIdentityGraphRow] = installedProductIds.includes("reputation-manager")
    ? await db
        .select({ id: repIdentityGraphs.id, operatorName: repIdentityGraphs.operatorName, soleAuthorityName: repIdentityGraphs.soleAuthorityName })
        .from(repIdentityGraphs)
        .where(eq(repIdentityGraphs.engagementId, id))
        .limit(1)
    : [];

  // Bug fix: WorkersPanel's membership used to be "every Showtime worker,
  // unconditionally, plus every RM worker once the identity graph exists"
  // — the full catalog for whichever product(s) applied, not what's
  // actually turned on. Enabling one RM skill (say AI Engine Watch) made
  // all 5 RM cards appear, which read as broken ("I only enabled one").
  // Now this page is a live status view of what's actually running for
  // this client — getEnabledWorkerIdsForEngagement, the same "is this
  // worker actually on" check the Library and every other worker list in
  // this app already trusts — and enabling more of the catalog is the
  // Library's job (browse a Worker's own page, enable what you want
  // there), not something this page needs its own "show everything so
  // there's a way to turn it back on" fallback for anymore.
  const workerIds: WorkerId[] = await getEnabledWorkerIdsForEngagement(id);

  // Product-onboarding gate (see src/lib/product-onboarding.ts) — only
  // computed for products actually represented in workerIds, since a
  // product with nothing enabled here has nothing on this page's grid to
  // gate in the first place (WorkersPanel only ever shows the already-
  // enabled subset; see this page's own comment above).
  const productIdsInPlay = Array.from(new Set(workerIds.map((wid) => WORKER_REGISTRY[wid].productId)));
  const stackForGate = engagement.stack as EngagementStack | null;
  const productOnboardedEntries = await Promise.all(
    productIdsInPlay.map(async (pid): Promise<[ProductId, boolean]> => [pid, await isProductOnboarded(pid, id)])
  );
  const productOnboarded: Partial<Record<ProductId, boolean>> = Object.fromEntries(productOnboardedEntries);
  const productOnboardingSkipDismissed: Partial<Record<ProductId, boolean>> = Object.fromEntries(
    PRODUCT_IDS.map((pid) => [pid, isProductOnboardingSkipDismissed(stackForGate, pid)])
  );

  // Closes WorkersPanel's own "not_run" ambiguity — flagged during this
  // session's patch-verification pass: a worker that's never fired reads
  // identically whether that's "fine, just hasn't happened yet" or "would
  // fail immediately, required fields are blank." getMissingRequiredFields
  // is the exact same gate inngest/skill.ts itself checks before every
  // dispatch (worker-config-completeness.ts) — a worker with no CHECKERS
  // entry resolves to [] with no DB call at all, so this costs nothing
  // extra for the 20 zero-config workers.
  const missingFieldsEntries = await Promise.all(
    workerIds.map(async (wid): Promise<[WorkerId, MissingField[]]> => [wid, await getMissingRequiredFields(wid, id)])
  );
  const missingFieldsByWorkerId: Partial<Record<WorkerId, MissingField[]>> = Object.fromEntries(missingFieldsEntries);

  // Same dynamic, per-worker block model dashboard/reports uses now —
  // replaces the old separately-gated ClientReportCard/RepClientReportCard
  // split below, which showed a real, correctly-zeroed Showtime card even
  // for a client with no Showtime setup at all (gated on stack?.booking_platform
  // only for its header language, not its existence).
  const now = new Date();
  const reportPeriodStart = (period: ReportPeriod): Date | null => {
    if (period === "week") return startOfWeek(now);
    if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
    return null;
  };
  const [weekBlocks, monthBlocks, allTimeBlocks, priorWeekSnapshot] = await Promise.all([
    getReportBlocksForEngagement(id, workerIds, { start: reportPeriodStart("week") }),
    getReportBlocksForEngagement(id, workerIds, { start: reportPeriodStart("month") }),
    getReportBlocksForEngagement(id, workerIds, { start: reportPeriodStart("all_time") }),
    getPriorSnapshot(id, startOfWeek(now)),
  ]);
  const reportBlocksByPeriod: Record<ReportPeriod, ReportBlockWithTrend[]> = {
    week: attachTrends(weekBlocks, priorWeekSnapshot?.blocks ?? null),
    month: attachTrends(monthBlocks, null),
    all_time: attachTrends(allTimeBlocks, null),
  };

  const recentAccountReviews = (await getRecentAccountReviews(id)).map((r) => ({ ...r, generatedAt: r.generatedAt.toISOString() }));

  const runsBySkill = Object.fromEntries(
    SKILLS.map((skill) => [skill, runs.filter((r) => r.skillName === skill)])
  ) as Record<SkillName, typeof runs>;

  // No separate skill-state fetch needed for WorkersPanel's toggles
  // anymore — workerIds (above) is now exactly the enabled subset, and
  // WorkersPanel already defaults an id with no explicit initialStates
  // entry to "on", which is correct for every id in this array by
  // construction. `runs` already covers every skillRuns row for this
  // engagement regardless of product (no skillName filter on that query),
  // so no separate fetch is needed for that either.
  const repRunsBySkill = Object.fromEntries(
    REP_SKILL_IDS.map((skill) => [skill, runs.filter((r) => r.skillName === skill)])
  ) as Record<RepSkillId, typeof runs>;
  const repAuditEvents = repIdentityGraphRow ? await getRecentAuditEvents(id, 20) : [];

  // Runtime Ownership section disabled for now (see the commented JSX
  // block below) — artifacts.owner is hardcoded to "mudd_ventures" on
  // every insert (recovery-service.ts), with no code path anywhere that
  // ever writes "buyer", so the panel this fed could only ever display
  // "Runs on our infra" regardless of an engagement's real export state
  // (that real state lives in stack.runtime_ownership_model instead, set
  // by markWinBackExported — a real mechanism, just not wired to this
  // table or to any dashboard UI yet). Re-enable once the panel reads the
  // real flag and a real export action exists to flip it.
  // const artifactRows = await db
  //   .select()
  //   .from(artifacts)
  //   .where(eq(artifacts.engagementId, id))
  //   .orderBy(desc(artifacts.createdAt));

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

  // const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  //   recovery_cadence: "Win-Back recovery cadence",
  //   long_term_nurture: "Win-Back long-term nurture",
  // };

  // const OWNER_LABELS: Record<string, string> = {
  //   mudd_ventures: "Runs on our infra",
  //   buyer: "Exported to buyer's infra",
  // };

  return (
    <div className="relative min-h-screen w-full mx-auto tracking-tight antialiased px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200 overflow-hidden pb-10">
      
      {/* Dot Grid Background */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" 
        aria-hidden="true"
      />

      {/* Page Content */}
      <div className="relative z-10 space-y-6">

        {/* Flat Header Section */}
        <div className="space-y-5 border-b border-zinc-200 dark:border-zinc-800/80 pb-5">
          <SetBreadcrumbLabel label={engagement.buyer} />

          {/* Title & Action Buttons Row */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            {/* Left Column: Back Button, Title, ID, and Stack Badges */}
            <div className="flex items-start gap-3 min-w-0">
              <Link
                href="/dashboard/engagements"
                className="flex items-center justify-center w-8 h-8 rounded-full border border-border bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0 mt-0.5"
                aria-label="Back to All Clients"
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
              
              <div className="min-w-0 space-y-1.5">
                <div>
                  <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
                    {engagement.buyer}
                  </h1>
                </div>

                {/* Clean Meta Row */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 translate-y-3.5 -mb-3 -ml-11 z-10 relative">
                  <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">
                    {bookingPlatformLabel(stack?.booking_platform)}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-border text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">
                    {emailPlatformLabel(stack?.email_platform)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Sync Status & Top Action Controls */}
            <div className="flex flex-col sm:items-end gap-2.5 shrink-0 self-start sm:self-auto">
              {stack?.booking_platform && (
                <BookingSyncChip
                  status={computeBookingSyncStatus(engagement.engagementId, engagement.stack as EngagementStack | null)}
                />
              )}
              <div className="flex items-center gap-2" data-tour="engagement-pause-control">
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
                  clientDetails={{
                    queuePinWindowHours: engagement.queuePinWindowHours,
                    notificationPackSelections: (engagement.stack as EngagementStack | null)?.notification_pack_selections ?? [],
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* One merged report, whichever workers are actually enabled —
            see worker-report-blocks.ts. Replaces the old separately-gated
            ClientReportCard/RepClientReportCard split, which showed a
            real, correctly-zeroed Showtime card even for a client with no
            Showtime setup at all. */}
        <div data-tour="engagement-report">
          <DynamicClientReport engagementId={id} offerDetails={offerDetails} blocksByPeriod={reportBlocksByPeriod} enabledWorkerIds={workerIds} />
        </div>

        <AccountAdvisorPanel engagementId={engagement.engagementId} initialReviews={recentAccountReviews} />

        <div data-tour="engagement-workers-panel">
          <WorkersPanel
            engagementId={engagement.engagementId}
            workerIds={workerIds}
            initialStates={{}}
            runsByWorker={{ ...runsBySkill, ...repRunsBySkill }}
            isPaused={Boolean(engagement.pausedAt)}
            productOnboarded={productOnboarded}
            productOnboardingSkipDismissed={productOnboardingSkipDismissed}
            missingFieldsByWorkerId={missingFieldsByWorkerId}
          />
        </div>

        {repIdentityGraphRow && <RepAuditLogPanel events={repAuditEvents} />}

        {repIdentityGraphRow && (
          <Link
            href={`/dashboard/engagements/${engagement.engagementId}/offensive`}
            className="group flex items-center justify-between gap-3 no-ambient-glow surface-glass-2 rounded-2xl p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                <Megaphone size={16} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  Grow your reputation
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Three guided steps to improve what Google and AI assistants say about this client: their website, the press, and Reddit.</p>
              </div>
            </div>
            <ArrowRight size={16} className="text-zinc-400 shrink-0" />
          </Link>
        )}

        {engagement.pausedAt && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-xs font-mono text-amber-800 dark:text-amber-400">
            This client is paused. Nightly briefs, leak map, win-back, weekly metrics, and booking polling are all
            skipping it.{engagement.pausedReason ? ` Reason: ${engagement.pausedReason}` : ""} Manual &quot;Run&quot; buttons
            below still work if you need to test something.
          </div>
        )}

        {/* Master Roster Calendar — bookings, calls, Pile-On/Win-Back/Leak-Map
            activity are all Showtime concepts (Reputation Manager has no
            "booked call" of its own); rendered unconditionally before, so
            an RM-only client with zero Showtime skills saw a permanently
            empty booking calendar with nothing relevant to show. */}
        {installedProductIds.includes("showtime") && <MasterRosterCalendar engagementId={id} />}

        {/* Brand voice, ad briefs, script pack, and confirmation-page audit
            (DeliverablesPanel) used to render here unconditionally for
            every engagement, pin-down enabled or not — moved to pin-down's
            own dedicated page (skills/pin-down, see skill-pages.tsx), same as every
            other skill in SKILLS_WITH_OWN_PAGE, instead of always showing
            on the main engagement page regardless of setup state. */}

        {(conversationIntelligenceState.enabled || conversationIntelligenceSessionRows.length > 0) && (
          <CallIntelligenceLog sessions={conversationIntelligenceSessionRows} />
        )}

        {/* Runtime Ownership — commented out for now, not deleted.
            Disabled because it was misleading, not because the section
            has no future: artifacts.owner is hardcoded to "mudd_ventures"
            on every insert (recovery-service.ts), so this could only ever
            show "Runs on our infra" no matter what actually happened to
            the engagement. The real export state (stack.runtime_ownership_model)
            and a real export action (exportWinBackToSkillPack /
            markWinBackExported, src/features/win-back/server/export-to-skill-pack.ts)
            both exist server-side, just disconnected from this table and
            from any dashboard UI. Re-enable once the panel reads that real
            flag and a real "Export" action can actually flip it.
        {artifactRows.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" /> Runtime Ownership
            </h2>
            <div className="bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl p-4 space-y-2">
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
                          : "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border-border"
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
        */}

        {/* Run History — fully client-side filtering now, see
            run-history-panel.tsx's own header for why. */}
        {runs.length > 0 && <RunHistoryPanel engagementId={id} runs={runs} capped={runHistoryCapped} />}

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