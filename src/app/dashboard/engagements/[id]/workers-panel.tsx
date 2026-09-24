"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Settings2, TrendingUp, Workflow, Search, ShieldAlert, PauseCircle, X } from "lucide-react";
import { type ModuleStatus } from "@/lib/copy";
import { WORKER_REGISTRY, SKILLS_WITH_OWN_PAGE, REP_SKILLS_WITH_FINDINGS_PAGE, COLD_OPEN_SKILLS_WITH_FINDINGS_PAGE, workerPrimaryHref, type WorkerId } from "@/lib/worker-registry";
import { hasWorkerConfigForm, renderWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { type MissingField } from "@/lib/worker-config-completeness-shared";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { TriggerSkillButton } from "./trigger-skill-button";
import { ProductOnboardingGateModal } from "@/components/library/product-onboarding-gate-modal";
import { PRODUCT_ONBOARDING_WORKER_ID } from "@/lib/worker-registry";
import type { ProductId } from "@/lib/product-catalog";
import { useToast } from "@/components/toast/toast-provider";

/**
 * Replaces SkillsPanel + RepSkillsPanel — two near-identical components
 * (same card layout, same toggle logic, same status derivation) that
 * only differed in which fixed id list and badge component they used.
 * One grid now, driven by WORKER_REGISTRY, so a worker's on/off state
 * can't disagree between here and the Library (both read the same
 * engagementSkills table through the same product-appropriate endpoint)
 * and a future product's workers show up here without a third
 * copy-pasted panel.
 *
 * Membership (workerIds, passed in from the page) is now a live status
 * view — exactly this client's currently-enabled skills, across both
 * products, not the full catalog for whichever product happens to apply.
 * Enabling a single Reputation Manager skill used to bring all 5 RM cards
 * along with it, read as broken ("I only enabled one"). A skill toggled
 * off here does disappear on the next load — that's no longer a dead
 * end: the Library's own per-Worker page (/dashboard/library/[product])
 * is where you browse and re-enable any skill, installed or not, so this
 * panel doesn't need its own "show everything just in case" fallback.
 */

export interface ModuleRunDTO {
  id: string;
  skillName: string;
  status: string;
  phase: string | null;
  errorMessage: string | null;
  startedAt: Date | string;
  completedAt: Date | string | null;
  stepCount: number;
}


function deriveModuleStatus(runs: ModuleRunDTO[], isEnabled: boolean, isPaused: boolean, missingFieldCount: number): ModuleStatus | "disabled" {
  if (!isEnabled) return "disabled";
  if (isPaused) {
    const s = runs?.[0]?.status.toLowerCase();
    if (s === "failed") return "failed";
    return "paused";
  }
  // Only for the "hasn't run yet" case — a worker with real run history
  // already has better evidence than a static field check (its last run
  // either worked or it didn't), and a config gap discovered after a
  // worker went live is exactly what "failed" already reports, with the
  // real error attached. This is purely about the first-run gap: distinct
  // from "hasn't fired yet, that's fine" is "would fail immediately if it
  // fired right now" — same gate inngest/skill.ts itself checks.
  if ((!runs || runs.length === 0) && missingFieldCount > 0) return "needs_setup";
  if (!runs || runs.length === 0) return "not_run";
  const s = runs[0].status.toLowerCase();
  if (s === "success") return "live";
  if (s === "failed") return "failed";
  if (s === "running" || s === "in_progress") return "running";
  return "not_run";
}

export function WorkersPanel({
  engagementId,
  workerIds,
  initialStates,
  runsByWorker,
  isPaused = false,
  productOnboarded = {},
  productOnboardingSkipDismissed = {},
  missingFieldsByWorkerId = {},
}: {
  engagementId: string;
  workerIds: WorkerId[];
  initialStates: Record<string, boolean>;
  runsByWorker: Record<string, ModuleRunDTO[]>;
  isPaused?: boolean;
  /** Per-product onboarding status (see src/lib/product-onboarding.ts) —
   * this page can show workers from several products at once, unlike the
   * Library's per-product page, so this is keyed rather than one value.
   * A product missing from this map is treated as onboarded (ungated),
   * same permissive default worker-card.tsx uses. */
  productOnboarded?: Partial<Record<ProductId, boolean>>;
  productOnboardingSkipDismissed?: Partial<Record<ProductId, boolean>>;
  /** worker-config-completeness.ts's own gate, precomputed server-side for
   * every worker on this page — see this file's own deriveModuleStatus. */
  missingFieldsByWorkerId?: Partial<Record<WorkerId, MissingField[]>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [states, setStates] = useState<Record<string, boolean>>(initialStates);
  const [skipDismissed, setSkipDismissed] = useState<Partial<Record<ProductId, boolean>>>(productOnboardingSkipDismissed);
  const [gateWorkerId, setGateWorkerId] = useState<WorkerId | null>(null);
  // UX-audit fix: was a single `string | null`, so toggling worker B
  // while worker A's request was still in flight overwrote A's busy
  // state with B's — whichever request's `finally` resolved first then
  // cleared busy for BOTH, letting the still-in-flight one be clicked
  // again mid-request. A Set tracks each worker's own busy state
  // independently, the same way multiple concurrent toggles actually
  // behave.
  const [updatingWorkers, setUpdatingWorkers] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  // UX fix: Configure used to always navigate to a whole new route just
  // to show a form — same pattern OverviewStatsPanel's Tasks/Issues tiles
  // already use for this exact reason (expand in place on the same page,
  // don't make the user leave to see something that isn't a different
  // page's worth of content). WorkersPanel already shows every worker for
  // this one client, so it's exactly the kind of page that pattern was
  // asked to extend to. The bridges/[workerId] routes themselves stay —
  // still real, bookmarkable pages — this just stops Configure from being
  // the only way to reach them.
  const [expandedWorker, setExpandedWorker] = useState<WorkerId | null>(null);

  function toggleEndpoint(workerId: WorkerId): string {
    const productId = WORKER_REGISTRY[workerId].productId;
    if (productId === "reputation-manager") return `/api/engagements/${engagementId}/skills/rep/${workerId}`;
    if (productId === "cold-open") return `/api/engagements/${engagementId}/skills/cold-open/${workerId}`;
    if (productId === "whop-agent") return `/api/engagements/${engagementId}/skills/whop-agent/${workerId}`;
    return `/api/engagements/${engagementId}/skills/${workerId}`;
  }

  async function handleToggle(workerId: WorkerId) {
    const nextState = !states[workerId];
    const previousState = states[workerId];

    setStates((prev) => ({ ...prev, [workerId]: nextState }));
    setUpdatingWorkers((prev) => new Set(prev).add(workerId));

    startTransition(async () => {
      try {
        const res = await fetch(toggleEndpoint(workerId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: nextState }),
        });

        if (!res.ok) {
          setStates((prev) => ({ ...prev, [workerId]: previousState }));
          // Defensive backstop for the gate handleToggleClick already
          // checks proactively via productOnboarded — a race (onboarding
          // status changed between page load and click) still lands here
          // instead of just silently reverting the toggle.
          const body = await res.json().catch(() => ({}));
          if (res.status === 422 && body.bridgeHref) {
            setGateWorkerId(workerId);
          } else if (res.status === 422 && body.missingFields) {
            // Phase 2 items 8-9's own case: this worker's own fields (a
            // secret, or a genuinely irreducible blocking field the
            // resolver pass couldn't fill in) are what's missing, not the
            // whole product's onboarding — a narrow, specific reason
            // instead of the ProductOnboardingGateModal, which is about a
            // different problem.
            toast.error(body.error ?? `${WORKER_REGISTRY[workerId].name} can't be enabled yet. Required fields are missing.`);
          }
        } else {
          toast.success(`${WORKER_REGISTRY[workerId].name} ${nextState ? "enabled" : "disabled"}.`);
          router.refresh();
        }
      } catch {
        setStates((prev) => ({ ...prev, [workerId]: previousState }));
      } finally {
        setUpdatingWorkers((prev) => {
          const next = new Set(prev);
          next.delete(workerId);
          return next;
        });
      }
    });
  }

  function handleToggleClick(workerId: WorkerId) {
    const worker = WORKER_REGISTRY[workerId];
    const enabling = !states[workerId];
    if (enabling && worker.runOnSetup) {
      router.push(`/dashboard/engagements/${engagementId}/bridges/${workerId}`);
      return;
    }
    // Already known client-side — open the gate modal directly instead of
    // a round trip just to be told the same thing the page already knows.
    // Same product-onboarding gate worker-card.tsx checks (see
    // src/lib/product-onboarding.ts's header).
    if (enabling && !worker.runOnSetup && productOnboarded[worker.productId] === false) {
      setGateWorkerId(workerId);
      return;
    }
    handleToggle(workerId);
  }

  // Same `?? true` default as each card's own isEnabled below — both
  // getEngagementSkillStates and getRepEngagementSkillStates always
  // populate every id they're asked about, so this fallback shouldn't
  // matter today, but a header count that could silently disagree with
  // the cards it's counting is exactly the kind of drift worth not
  // risking for a one-line difference.
  const activeCount = workerIds.filter((id) => states[id] ?? true).length;

  return (
    <div className="w-full space-y-3 font-sans">
      <div className="flex items-center justify-between gap-4 pb-1.5 border-b border-zinc-200/80 dark:border-zinc-800/60">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-900 dark:text-zinc-100">Skills</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed font-sans">
            Status, configuration, and manual executions for every skill installed for this client. Showtime and
            Reputation Manager together, whichever this client actually has running.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isPaused && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
              <PauseCircle className="w-3 h-3" />
              Client paused
            </span>
          )}
          <span className="text-xs font-mono font-medium text-zinc-500 dark:text-zinc-400">
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</span>/{workerIds.length} active
          </span>
        </div>
      </div>

      {/* Same in-place swap OverviewStatsPanel's Tasks/Issues tiles use —
          configuring a worker hides the whole card grid and renders the
          form in its exact place, instead of appending a second block
          below every card the user would have to scroll past. Transparent,
          no card chrome — the form is the content, not a widget floating
          on top of one. */}
      {expandedWorker ? (
        <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <button
            type="button"
            onClick={() => setExpandedWorker(null)}
            className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Back to all skills
          </button>

          {renderWorkerConfigForm(expandedWorker, {
            engagementId,
            onClose: () => setExpandedWorker(null),
            // A setup form that started a run goes to that run; any other
            // save just closes the form.
            onSaved: (result) => (result.runId ? router.push(`/dashboard/runs/${result.runId}`) : setExpandedWorker(null)),
            cancelLabel: "Close",
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          {workerIds.map((workerId) => {
          const worker = WORKER_REGISTRY[workerId];
          const isEnabled = states[workerId] ?? true;
          const isBusy = updatingWorkers.has(workerId);
          const workerRuns = runsByWorker[workerId] ?? [];
          const missingFields = missingFieldsByWorkerId[workerId] ?? [];
          const status = deriveModuleStatus(workerRuns, isEnabled, isPaused, missingFields.length);
          const latestRun = workerRuns[0] ?? null;
          const isPausedActive = isEnabled && isPaused;
          const isNeedsSetup = status === "needs_setup";

          return (
            <div
              key={workerId}
              className={`rounded-lg border p-3 flex flex-col justify-between min-h-[168px] transition-all shadow-2xs ${
                isPausedActive
                  ? "border-amber-300/70 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/[0.04] backdrop-blur-xs"
                  : isEnabled
                    ? "border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 backdrop-blur-xs"
                    : "border-zinc-200/60 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/40 opacity-75"
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <AnySkillBadge skill={workerId} size={26} enabled={isEnabled} paused={isPausedActive} />
                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-xs font-bold tracking-tight truncate block ${
                          isEnabled ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
                        }`}
                      >
                        {worker.name}
                      </span>
                      <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug line-clamp-1">{worker.description}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => !isBusy && handleToggleClick(workerId)}
                    disabled={isBusy}
                    aria-label={`Toggle ${worker.name}`}
                    title={
                      !isEnabled && !worker.runOnSetup && productOnboarded[worker.productId] === false
                        ? `${WORKER_REGISTRY[PRODUCT_ONBOARDING_WORKER_ID[worker.productId]].name} needs to run first${skipDismissed[worker.productId] ? "" : " (click for details)"}`
                        : undefined
                    }
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none shadow-inner ${
                      isEnabled ? "bg-amber-400 border border-amber-500/30" : "bg-zinc-300 dark:bg-zinc-800 border border-zinc-400/30 dark:border-zinc-700/50"
                    } ${isBusy ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                        isEnabled ? "translate-x-[14px]" : "translate-x-[2px]"
                      }`}
                    />
                  </button>
                </div>

                {(latestRun || isNeedsSetup) && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-1.5 space-y-1">
                    {isEnabled && latestRun ? (
                      <div className="space-y-0.5 text-xs">
                        {latestRun.status.toLowerCase() === "failed" && latestRun.errorMessage && (
                          <p className="text-[10.5px] text-rose-600 dark:text-rose-400/90 leading-snug font-mono break-all line-clamp-1">{latestRun.errorMessage}</p>
                        )}
                        <div className="flex items-center justify-end font-mono text-[10.5px]">
                          <Link
                            href={`/dashboard/runs/${latestRun.id}`}
                            className="text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center gap-0.5"
                          >
                            View <ArrowRight className="w-2.5 h-2.5" />
                          </Link>
                        </div>
                      </div>
                    ) : isNeedsSetup ? (
                      <p className="text-[10.5px] text-orange-600 dark:text-orange-400 leading-snug font-mono line-clamp-1">
                        Missing: {missingFields.map((f) => f.label).join(", ")}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 mt-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                  {hasWorkerConfigForm(workerId) ? (
                    <button
                      type="button"
                      onClick={() => setExpandedWorker((prev) => (prev === workerId ? null : workerId))}
                      title={expandedWorker === workerId ? "Close" : "Configure"}
                      className={`transition-colors cursor-pointer ${
                        expandedWorker === workerId
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                      }`}
                    >
                      {expandedWorker === workerId ? <X size={13} /> : <Settings2 size={13} />}
                    </button>
                  ) : (
                    <span />
                  )}

                  {/* Icon-only, no background — a bare glyph + tooltip
                      reads cleaner in a row this dense than a repeated
                      text+icon link, and distinct icons per destination
                      (rather than one ExternalLink reused everywhere)
                      keep them tellable apart without the label. */}
                  <div className="ml-auto flex items-center gap-2.5">
                    <Link
                      href={`/dashboard/analytics/${workerId}`}
                      title="Analytics"
                      className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                    >
                      <TrendingUp size={13} />
                    </Link>

                    {SKILLS_WITH_OWN_PAGE.includes(workerId) && (
                      <Link
                        href={workerPrimaryHref(workerId, engagementId)}
                        title="Pipeline"
                        className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                      >
                        <Workflow size={13} />
                      </Link>
                    )}

                    {/* rep-crisis-response's real destination is the
                        incident tracker, not the shared findings feed —
                        workerPrimaryHref already routes it there (see
                        worker-registry.ts) — so it gets its own icon. */}
                    {(REP_SKILLS_WITH_FINDINGS_PAGE.includes(workerId) || workerId === "rep-crisis-response") && (
                      <Link
                        href={workerPrimaryHref(workerId, engagementId)}
                        title={workerId === "rep-crisis-response" ? "Incidents" : "Findings"}
                        className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                      >
                        {workerId === "rep-crisis-response" ? <ShieldAlert size={13} /> : <Search size={13} />}
                      </Link>
                    )}

                    {COLD_OPEN_SKILLS_WITH_FINDINGS_PAGE.includes(workerId) && (
                      <Link
                        href={workerPrimaryHref(workerId, engagementId)}
                        title="Pipeline"
                        className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                      >
                        <Workflow size={13} />
                      </Link>
                    )}
                  </div>
                </div>

                <TriggerSkillButton engagementId={engagementId} skillName={workerId} label={`Run ${worker.name}`} />
              </div>
            </div>
          );
        })}
      </div>
      )}

      {gateWorkerId && (() => {
        const worker = WORKER_REGISTRY[gateWorkerId];
        const onboardingWorkerId = PRODUCT_ONBOARDING_WORKER_ID[worker.productId];
        return (
          <ProductOnboardingGateModal
            engagementId={engagementId}
            productId={worker.productId}
            workerName={worker.name}
            onboardingWorkerName={WORKER_REGISTRY[onboardingWorkerId].name}
            bridgeHref={`/dashboard/engagements/${engagementId}/bridges/${onboardingWorkerId}`}
            onClose={() => setGateWorkerId(null)}
            onSkipped={() => setSkipDismissed((prev) => ({ ...prev, [worker.productId]: true }))}
          />
        );
      })()}
    </div>
  );
}
