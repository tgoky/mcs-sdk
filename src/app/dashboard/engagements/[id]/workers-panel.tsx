"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Settings2, ExternalLink, PauseCircle, X } from "lucide-react";
import { type ModuleStatus, phaseLabel } from "@/lib/copy";
import { WORKER_REGISTRY, SKILLS_WITH_OWN_PAGE, REP_SKILLS_WITH_FINDINGS_PAGE, type WorkerId } from "@/lib/worker-registry";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { StatusSwatch } from "@/components/status-swatch";
import { TriggerSkillButton } from "./trigger-skill-button";
import { LeakMapConfigForm } from "@/components/worker-config-forms/leak-map-config-form";
import { PinDownConfigForm } from "@/components/worker-config-forms/pin-down-config-form";
import { PreCallReadConfigForm } from "@/components/worker-config-forms/pre-call-read-config-form";
import { RepOnboardingConfigForm } from "@/components/worker-config-forms/rep-onboarding-config-form";
import { WinBackConfigForm } from "@/components/worker-config-forms/win-back-config-form";

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


function deriveModuleStatus(runs: ModuleRunDTO[], isEnabled: boolean, isPaused: boolean): ModuleStatus | "disabled" {
  if (!isEnabled) return "disabled";
  if (isPaused) {
    const s = runs?.[0]?.status.toLowerCase();
    if (s === "failed") return "failed";
    return "paused";
  }
  if (!runs || runs.length === 0) return "not_run";
  const s = runs[0].status.toLowerCase();
  if (s === "success") return "live";
  if (s === "failed") return "failed";
  if (s === "running" || s === "in_progress") return "running";
  return "not_run";
}

function PhaseTag({ phase, status }: { phase: string | null; status: string }) {
  const label = phaseLabel(phase);
  const isRunning = status.toLowerCase() === "running";
  return (
    <span className={`text-[11px] font-mono tracking-tight ${isRunning ? "text-sky-600 dark:text-sky-400 italic font-semibold" : "text-zinc-500 dark:text-zinc-400"}`}>
      {label}
    </span>
  );
}

export function WorkersPanel({
  engagementId,
  workerIds,
  initialStates,
  runsByWorker,
  isPaused = false,
}: {
  engagementId: string;
  workerIds: WorkerId[];
  initialStates: Record<string, boolean>;
  runsByWorker: Record<string, ModuleRunDTO[]>;
  isPaused?: boolean;
}) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, boolean>>(initialStates);
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
    return WORKER_REGISTRY[workerId].productId === "reputation-manager"
      ? `/api/engagements/${engagementId}/skills/rep/${workerId}`
      : `/api/engagements/${engagementId}/skills/${workerId}`;
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
        } else {
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
    if (!states[workerId] && WORKER_REGISTRY[workerId].runOnSetup) {
      router.push(`/dashboard/engagements/${engagementId}/bridges/${workerId}`);
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
            Status, configuration, and manual executions for every skill installed for this client — Showtime and
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
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setExpandedWorker(null)}
            className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Close — back to all skills
          </button>

          {expandedWorker === "leak-map" && (
            <LeakMapConfigForm engagementId={engagementId} onCancel={() => setExpandedWorker(null)} cancelLabel="Close" />
          )}
          {expandedWorker === "pre-call-read" && (
            <PreCallReadConfigForm engagementId={engagementId} onCancel={() => setExpandedWorker(null)} cancelLabel="Close" />
          )}
          {expandedWorker === "win-back" && (
            <WinBackConfigForm engagementId={engagementId} onCancel={() => setExpandedWorker(null)} cancelLabel="Close" />
          )}
          {expandedWorker === "rep-onboarding" && (
            <RepOnboardingConfigForm engagementId={engagementId} onCancel={() => setExpandedWorker(null)} />
          )}
          {expandedWorker === "pin-down" && (
            <PinDownConfigForm
              engagementId={engagementId}
              onCancel={() => setExpandedWorker(null)}
              onSaved={(result) => (result.runId ? router.push(`/dashboard/runs/${result.runId}`) : setExpandedWorker(null))}
              cancelLabel="Close"
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {workerIds.map((workerId) => {
          const worker = WORKER_REGISTRY[workerId];
          const isEnabled = states[workerId] ?? true;
          const isBusy = updatingWorkers.has(workerId);
          const workerRuns = runsByWorker[workerId] ?? [];
          const status = deriveModuleStatus(workerRuns, isEnabled, isPaused);
          const latestRun = workerRuns[0] ?? null;
          const isPausedActive = isEnabled && isPaused;

          return (
            <div
              key={workerId}
              className={`rounded-xl border p-3 flex flex-col justify-between min-h-[168px] transition-all shadow-2xs ${
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

                <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-1.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-semibold">Status</span>
                    <StatusSwatch status={status} />
                  </div>

                  {isEnabled && latestRun ? (
                    <div className="space-y-0.5 text-xs">
                      <div className="flex items-center justify-between font-mono text-[10.5px]">
                        <PhaseTag phase={latestRun.phase} status={latestRun.status} />
                        <Link
                          href={`/dashboard/runs/${latestRun.id}`}
                          className="text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center gap-0.5"
                        >
                          View <ArrowRight className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                      {latestRun.status.toLowerCase() === "failed" && latestRun.errorMessage && (
                        <p className="text-[10.5px] text-rose-600 dark:text-rose-400/90 leading-snug font-mono break-all line-clamp-1">{latestRun.errorMessage}</p>
                      )}
                      {isPausedActive && (
                        <p className="text-[10.5px] text-amber-600 dark:text-amber-400 italic font-mono">Paused with the client.</p>
                      )}
                    </div>
                  ) : isPausedActive ? (
                    <p className="text-[10.5px] text-amber-600 dark:text-amber-400 italic font-mono">On hold — client paused.</p>
                  ) : isEnabled ? (
                    <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 italic font-mono">No executions yet.</p>
                  ) : (
                    <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 italic font-mono">Turned off.</p>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 mt-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                  {worker.hasHingesPanel ? (
                    <button
                      type="button"
                      onClick={() => setExpandedWorker((prev) => (prev === workerId ? null : workerId))}
                      className={`inline-flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                        expandedWorker === workerId
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                      }`}
                    >
                      {expandedWorker === workerId ? <X size={12} /> : <Settings2 size={12} />}
                      <span>{expandedWorker === workerId ? "Close" : "Configure"}</span>
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="ml-auto flex items-center gap-3">
                    {/* Gap fix: Library's worker-card.tsx has always linked
                        to each worker's Phase 8 analytics page — this card
                        never did, the only place a worker's real run stats
                        weren't reachable from. */}
                    <Link
                      href={`/dashboard/analytics/${workerId}`}
                      className="inline-flex items-center gap-1 font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                    >
                      <span>Analytics</span>
                      <ExternalLink size={11} />
                    </Link>

                    {SKILLS_WITH_OWN_PAGE.includes(workerId) && (
                      <Link
                        href={`/dashboard/engagements/${engagementId}/skills/${workerId}`}
                        className="inline-flex items-center gap-1 font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                      >
                        <span>Pipeline</span>
                        <ExternalLink size={11} />
                      </Link>
                    )}

                    {REP_SKILLS_WITH_FINDINGS_PAGE.includes(workerId) && (
                      <Link
                        href={`/dashboard/engagements/${engagementId}/skills/reputation-manager`}
                        className="inline-flex items-center gap-1 font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                      >
                        <span>Findings</span>
                        <ExternalLink size={11} />
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
    </div>
  );
}
