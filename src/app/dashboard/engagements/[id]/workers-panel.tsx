"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings2, TrendingUp, PauseCircle, X } from "lucide-react";
import { type ModuleStatus, WORKSPACE_PRODUCTS } from "@/lib/copy";
import { WORKER_REGISTRY, workerPrimaryHref, skillToggleEndpoint, type WorkerId } from "@/lib/worker-registry";
import { hasWorkerConfigForm, renderWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { type MissingField } from "@/lib/worker-config-completeness-shared";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { TriggerSkillButton } from "./trigger-skill-button";
import { ProductOnboardingGateModal } from "@/components/library/product-onboarding-gate-modal";
import { PRODUCT_ONBOARDING_WORKER_ID } from "@/lib/worker-registry";
import { PRODUCT_IDS, type ProductId } from "@/lib/product-catalog";
import { useToast } from "@/components/toast/toast-provider";
import { deliveryLine, type SkillDeliveryProof } from "@/lib/delivery-receipts-shared";

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

const STATUS_LABEL: Record<ModuleStatus | "disabled", string> = {
  live: "Working",
  failed: "Failed",
  running: "Running",
  not_run: "Not run yet",
  needs_setup: "Needs setup",
  paused: "Paused",
  disabled: "Off",
};

// Three status colors: working, needs you, and everything else neutral.
const STATUS_TONE: Record<ModuleStatus | "disabled", string> = {
  live: "text-status-success",
  failed: "text-status-error",
  needs_setup: "text-status-error",
  running: "text-status-neutral",
  not_run: "text-status-neutral",
  paused: "text-status-neutral",
  disabled: "text-status-neutral",
};

function sinceLabel(at: Date | string): string {
  const ms = Date.now() - new Date(at).getTime();
  const min = Math.round(ms / 60_000);
  if (!Number.isFinite(min)) return "";
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  deliveryProofByWorker = {},
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
  /** What the providers said about this skill's recent messages
   * (lib/delivery-receipts.ts): the proof it's reaching people, not just
   * running. Only skills that send messages have one. */
  deliveryProofByWorker?: Partial<Record<WorkerId, SkillDeliveryProof>>;
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

  async function handleToggle(workerId: WorkerId) {
    const nextState = !states[workerId];
    const previousState = states[workerId];

    setStates((prev) => ({ ...prev, [workerId]: nextState }));
    setUpdatingWorkers((prev) => new Set(prev).add(workerId));

    startTransition(async () => {
      try {
        const res = await fetch(skillToggleEndpoint(engagementId, workerId), {
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
        // One row per skill, grouped by product: the page doesn't grow a card
        // per skill switched on, and every row reads the same way (name, how
        // it's doing, when it last ran, then Configure, Run and its switch).
        <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          {PRODUCT_IDS.map((productId) => ({ productId, ids: workerIds.filter((id) => WORKER_REGISTRY[id].productId === productId) }))
            .filter((g) => g.ids.length > 0)
            .map(({ productId, ids }) => (
              <section key={productId} className="space-y-1">
                <h3 className="px-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{WORKSPACE_PRODUCTS.find((p) => p.id === productId)?.name ?? productId}</h3>
                <ul className="divide-y divide-zinc-200/80 rounded-xl border border-zinc-200/80 bg-white/70 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
                  {ids.map((workerId) => {
                    const worker = WORKER_REGISTRY[workerId];
                    const isEnabled = states[workerId] ?? true;
                    const isBusy = updatingWorkers.has(workerId);
                    const workerRuns = runsByWorker[workerId] ?? [];
                    const missingFields = missingFieldsByWorkerId[workerId] ?? [];
                    const runStatus = deriveModuleStatus(workerRuns, isEnabled, isPaused, missingFields.length);
                    const delivery = isEnabled ? deliveryLine(deliveryProofByWorker[workerId], sinceLabel) : null;
                    // A skill whose runs succeed but whose messages never
                    // arrive isn't working, whatever its last run says.
                    const status = runStatus === "live" && delivery?.notDelivering ? "failed" : runStatus;
                    const latestRun = workerRuns[0] ?? null;
                    const isPausedActive = isEnabled && isPaused;
                    const detail =
                      runStatus === "failed" && latestRun?.errorMessage
                        ? { text: latestRun.errorMessage, tone: "text-status-error" }
                        : status === "needs_setup"
                          ? { text: `Missing: ${missingFields.map((f) => f.label).join(", ")}`, tone: "text-status-error" }
                          : delivery
                            ? { text: delivery.text, tone: delivery.tone === "error" ? "text-status-error" : "text-zinc-500 dark:text-zinc-400" }
                            : null;
                    return (
                      <li key={workerId} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 ${isEnabled ? "" : "opacity-60"}`}>
                        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
                          <AnySkillBadge skill={workerId} size={22} enabled={isEnabled} paused={isPausedActive} />
                          <div className="min-w-0">
                            <Link href={workerPrimaryHref(workerId, engagementId)} className="block truncate text-[13px] font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                              {worker.name}
                            </Link>
                            {detail && <p className={`truncate font-mono text-[11px] ${detail.tone}`}>{detail.text}</p>}
                          </div>
                        </div>
                        <span className={`w-20 shrink-0 text-[12px] ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
                        <span className="w-28 shrink-0 text-[12px] text-zinc-500 dark:text-zinc-400">
                          {latestRun ? (
                            <Link href={`/dashboard/runs/${latestRun.id}`} className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
                              {sinceLabel(latestRun.startedAt)}
                            </Link>
                          ) : (
                            "Never run"
                          )}
                        </span>
                        <div className="flex shrink-0 items-center gap-3">
                          {hasWorkerConfigForm(workerId) && (
                            <button
                              type="button"
                              onClick={() => setExpandedWorker(workerId)}
                              title="Configure"
                              aria-label={`Configure ${worker.name}`}
                              className="text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
                            >
                              <Settings2 size={14} />
                            </button>
                          )}
                          <Link href={`/dashboard/analytics/${workerId}`} title="Analytics" aria-label={`${worker.name} analytics`} className="text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                            <TrendingUp size={14} />
                          </Link>
                          {isEnabled && <TriggerSkillButton engagementId={engagementId} skillName={workerId} label={`Run ${worker.name}`} compact />}
                          <button
                            type="button"
                            onClick={() => !isBusy && handleToggleClick(workerId)}
                            disabled={isBusy}
                            role="switch"
                            aria-checked={isEnabled}
                            aria-label={`${worker.name} ${isEnabled ? "on" : "off"}`}
                            title={
                              !isEnabled && !worker.runOnSetup && productOnboarded[worker.productId] === false
                                ? `${WORKER_REGISTRY[PRODUCT_ONBOARDING_WORKER_ID[worker.productId]].name} needs to run first${skipDismissed[worker.productId] ? "" : " (click for details)"}`
                                : undefined
                            }
                            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border shadow-inner transition-all duration-200 ease-in-out focus:outline-none ${
                              isEnabled ? "border-amber-500/30 bg-amber-400" : "border-zinc-400/30 bg-zinc-300 dark:border-zinc-700/50 dark:bg-zinc-800"
                            } ${isBusy ? "opacity-50" : ""}`}
                          >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${isEnabled ? "translate-x-[14px]" : "translate-x-[2px]"}`} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
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
