"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, BarChart3, X, AlertTriangle, ArrowRight } from "lucide-react";
import type { WorkerDefinition } from "@/lib/worker-registry";
import { workerPrimaryHref, PRODUCT_ONBOARDING_WORKER_ID, WORKER_REGISTRY } from "@/lib/worker-registry";
import type { WorkerOverviewStat } from "@/lib/worker-analytics";
import type { SkillPlaybook } from "@/lib/skill-playbooks";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { EnablePileOnModal } from "./enable-worker-modal";
import { ProductOnboardingGateModal } from "./product-onboarding-gate-modal";

const PRODUCT_LABELS: Record<WorkerDefinition["productId"], string> = {
  showtime: "Showtime",
  "reputation-manager": "Reputation Manager",
  "cold-open": "Cold Open",
  "whop-agent": "Whop Agent",
};

const PRODUCT_ACCENT: Record<WorkerDefinition["productId"], string> = {
  showtime: "border-amber-200 dark:border-amber-900/70",
  "reputation-manager": "border-indigo-200 dark:border-indigo-900/70",
  "cold-open": "border-rose-200 dark:border-rose-900/70",
  "whop-agent": "border-sky-200 dark:border-sky-900/70",
};

/**
 * One worker, one card or row — enabled or not, for exactly one client
 * (whichever engagement the Library page resolved as this workspace's
 * primary one). A worker with no such engagement to enable against
 * (brand-new workspace, nothing created yet) can't do anything from here
 * — the card still renders so the catalog stays browsable, but its
 * Enable action is disabled with an explanation rather than silently
 * failing on click.
 *
 * `variant` picks the visual shape, not the behavior — every enable/
 * configure/analytics action, and all the state behind it, is identical
 * either way:
 *   - "card": the Library's top-level grid tile (unchanged).
 *   - "row": product-detail-client.tsx's vertical, stacked-underneath-
 *     each-other layout (ported back from the pre-two-tier Library),
 *     optionally with a `playbook`'s richer overview/trigger/workflow/
 *     deliverables copy underneath — see skill-playbooks.ts for which
 *     workers actually have that copy.
 */
export function WorkerCard({
  worker,
  enabled,
  engagementId,
  buyerName,
  stats,
  isConfiguring = false,
  onToggleConfigure,
  variant = "card",
  playbook,
  index,
  productOnboarded = true,
  productOnboardingSkipDismissed = false,
}: {
  worker: WorkerDefinition;
  enabled: boolean;
  engagementId: string | null;
  buyerName?: string | null;
  /** Real workload for this skill — runs/7d, success rate, needs-attention
   * — from worker-analytics.ts's getWorkspaceWorkerOverview. Undefined
   * only if a caller hasn't fetched it; the Library page always does, so
   * this is the "workload, what runs the most" a plain Install/Configure
   * card had no way to answer. */
  stats?: WorkerOverviewStat;
  /** Whether this card's Configure form is the one currently expanded
   * inline (see library-marketplace-client.tsx / product-detail-client.tsx,
   * which own that state and render the actual form — a card doesn't know
   * how to render any worker's form itself). */
  isConfiguring?: boolean;
  /** Only present for a hasHingesPanel worker with a real engagement to
   * configure — same gate configureHref used to decide whether to render
   * a Link at all. */
  onToggleConfigure?: () => void;
  variant?: "card" | "row";
  /** Real, previously-shipped per-skill copy — only Showtime's 5 skills
   * have one today (see skill-playbooks.ts). Ignored in "card" variant. */
  playbook?: SkillPlaybook;
  /** 1-based position in its Worker's skill list, for the row variant's
   * "01." numbering — matches the old Library's step numbering. */
  index?: number;
  /** Whether this worker's PRODUCT has completed its own onboarding
   * (see src/lib/product-onboarding.ts) — not this worker's own
   * runOnSetup flag, which only ever gated itself. Defaults to true
   * (ungated) so a caller that hasn't fetched this yet doesn't
   * accidentally block every Enable button. */
  productOnboarded?: boolean;
  /** Whether this engagement already dismissed the onboarding-gate modal
   * for this worker's product — see product-onboarding-gate-modal.tsx's
   * header. When true, a gated skill shows a quiet inline note instead of
   * popping the modal again. */
  productOnboardingSkipDismissed?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEnableModal, setShowEnableModal] = useState(false);
  const [skipDismissed, setSkipDismissed] = useState(productOnboardingSkipDismissed);
  const [gateModalOpen, setGateModalOpen] = useState(false);

  const needsOwnSetup = worker.runOnSetup;
  // Every OTHER skill in a not-yet-onboarded product — not this worker's
  // own runOnSetup flag, which only ever gated itself (see
  // src/lib/product-onboarding.ts's header for the full gap this closes).
  const needsProductOnboarding = !needsOwnSetup && !productOnboarded;
  const onboardingWorkerId = PRODUCT_ONBOARDING_WORKER_ID[worker.productId];
  const onboardingWorkerName = WORKER_REGISTRY[onboardingWorkerId].name;
  const onboardingBridgeHref = engagementId ? `/dashboard/engagements/${engagementId}/bridges/${onboardingWorkerId}?from=/dashboard/library` : null;
  // pile-on is the one worker with real "ask" config fields and no hinges
  // panel to answer them in — see enable-worker-modal.tsx's own header
  // for why this is scoped to pile-on specifically, not driven generically
  // off configFields.
  const needsLighterForm = worker.id === "pile-on";
  const bridgeHref = engagementId ? `/dashboard/engagements/${engagementId}/bridges/${worker.id}?from=/dashboard/library` : null;
  // UX fix: this used to always be a Link to the standalone bridges page
  // — Configure now expands the same form inline instead (accordion, in
  // the row variant), matching the same "don't navigate away just to see
  // a form" pattern WorkersPanel's own Configure button already uses.
  const canConfigureInline = worker.hasHingesPanel && Boolean(engagementId) && Boolean(onToggleConfigure);
  // A worker with no dedicated hinges panel has nothing to expand inline
  // — this used to land on the bare engagement page (`/dashboard/
  // engagements/${engagementId}`), which has no obvious way back to this
  // specific worker's own settings (e.g. Pile-On has no Configure entry
  // point on its own dedicated page either — that's a separate, real gap,
  // not something this href can paper over). Route to the worker's own
  // primary page instead, same as every other "go manage this skill"
  // link in the app already does.
  const plainConfigureHref = !worker.hasHingesPanel && engagementId ? workerPrimaryHref(worker.id, engagementId) : null;
  // Phase 8 — one destination shape for every worker's analytics,
  // regardless of product, instead of the old per-product lookup table
  // that routed Showtime and Reputation Manager workers to two
  // completely different pages.
  const analyticsHref = `/dashboard/analytics/${worker.id}`;

  async function enable() {
    if (!engagementId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/engagements/${engagementId}/workers/${worker.id}/enable`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Defensive backstop for the gate this component already checks
        // proactively via productOnboarded — a race (onboarding status
        // changed between page load and click) still lands here instead
        // of a plain error string.
        if (response.status === 422 && body.bridgeHref) {
          setGateModalOpen(true);
          return;
        }
        throw new Error(body.error ?? `Could not enable ${worker.name}.`);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not enable ${worker.name}.`);
    } finally {
      setPending(false);
    }
  }

  function handleEnableClick() {
    if (needsLighterForm) {
      setShowEnableModal(true);
      return;
    }
    if (needsProductOnboarding) {
      // Already known client-side (productOnboarded) — open the gate
      // modal directly instead of a round trip just to be told the same
      // thing the page already knows.
      setGateModalOpen(true);
      return;
    }
    enable();
  }

  // Icon-only, circular — the exact same shape every individual skill
  // page (skills/[workerId]/page.tsx) already uses for its own back
  // button: w-8 h-8, rounded-full, a subtle border and fill. No text
  // label — matching that convention means matching its restraint too,
  // not adding a label those pages don't have either.
  const configureAnalyticsClass =
    "flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0";
  const iconSize = "w-4 h-4";

  const actionControls = enabled ? (
    <>
      {canConfigureInline ? (
        <button
          type="button"
          onClick={onToggleConfigure}
          title={isConfiguring ? "Close" : "Configure"}
          className={
            isConfiguring
              ? "flex items-center justify-center w-8 h-8 rounded-full border border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 transition-colors shrink-0"
              : configureAnalyticsClass
          }
        >
          {isConfiguring ? <X className={iconSize} /> : <Settings className={iconSize} />}
        </button>
      ) : (
        plainConfigureHref && (
          <Link href={plainConfigureHref} title="Configure" className={configureAnalyticsClass}>
            <Settings className={iconSize} />
          </Link>
        )
      )}
      <Link href={analyticsHref} title="Analytics" className={configureAnalyticsClass}>
        <BarChart3 className={iconSize} />
      </Link>
    </>
  ) : needsOwnSetup ? (
    bridgeHref ? (
      <Link
        href={bridgeHref}
        className="inline-flex items-center justify-center rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 px-3.5 py-2 text-xs font-bold text-white dark:text-zinc-900 transition-colors whitespace-nowrap"
      >
        Set up {worker.name}
      </Link>
    ) : (
      <span className="text-xs text-zinc-500 dark:text-zinc-500">Create a client first to set this up.</span>
    )
  ) : needsProductOnboarding && skipDismissed ? (
    // Already dismissed once this session — no more popping the gate
    // modal on every skill in this product, just a quiet reminder that
    // stays available without being in the way.
    <Link
      href={onboardingBridgeHref ?? "#"}
      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors whitespace-nowrap"
    >
      Needs {onboardingWorkerName} first <ArrowRight size={11} />
    </Link>
  ) : (
    <button
      type="button"
      onClick={handleEnableClick}
      disabled={pending || !engagementId}
      title={!engagementId ? "Create a client first" : undefined}
      className="inline-flex items-center justify-center rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white dark:text-zinc-900 transition-colors cursor-pointer whitespace-nowrap"
    >
      {pending ? "Enabling…" : "Enable"}
    </button>
  );

  const enableModal = showEnableModal && engagementId && (
    <EnablePileOnModal
      engagementId={engagementId}
      buyerName={buyerName ?? undefined}
      onClose={() => setShowEnableModal(false)}
      onEnabled={() => {
        setShowEnableModal(false);
        router.refresh();
      }}
    />
  );

  const gateModal = gateModalOpen && engagementId && onboardingBridgeHref && (
    <ProductOnboardingGateModal
      engagementId={engagementId}
      productId={worker.productId}
      workerName={worker.name}
      onboardingWorkerName={onboardingWorkerName}
      bridgeHref={onboardingBridgeHref}
      onClose={() => setGateModalOpen(false)}
      onSkipped={() => setSkipDismissed(true)}
    />
  );

  if (variant === "row") {
    // Every worker's own dedicated page already exists (workerPrimaryHref
    // covers all of them — its own schedule page, RM's findings page,
    // the engagement's run history filtered to this skill, etc.), so the
    // row itself navigates there on click. The action controls (Configure/
    // Analytics/Enable) and the stats stop that click from bubbling up so
    // they keep doing their own thing instead of also triggering the
    // row's navigation.
    const primaryHref = engagementId ? workerPrimaryHref(worker.id, engagementId) : null;
    return (
      <div
        className={`relative py-5 -mx-5 px-5 transition-colors ${primaryHref ? "cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30" : ""}`}
        onClick={primaryHref ? () => router.push(primaryHref) : undefined}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <AnySkillBadge skill={worker.id} size={36} enabled={enabled} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {typeof index === "number" && (
                  <span className="text-xs font-mono font-bold text-zinc-400 dark:text-zinc-600">{String(index).padStart(2, "0")}.</span>
                )}
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{worker.name}</h3>
                {enabled && (
                  <span className="shrink-0 rounded-md bg-[#4d7c4d] dark:bg-[#5c8f5c] border border-[#3f663f] dark:border-[#4d7c4d] px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">
                    Enabled
                  </span>
                )}
                {worker.hasHingesPanel && <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500">configured per client</span>}
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed max-w-2xl">{worker.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 pl-[3rem] sm:pl-0">
            {stats && (
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-zinc-600 dark:text-zinc-400">
                  <strong className="text-zinc-900 dark:text-zinc-100 tabular-nums">{stats.runsInWindow}</strong> runs/7d
                </span>
                <span
                  className={
                    stats.successRate === null
                      ? "text-zinc-400 dark:text-zinc-600"
                      : stats.successRate >= 80
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-orange-600 dark:text-orange-400"
                  }
                >
                  {stats.successRate !== null ? `${stats.successRate}%` : "—"}
                </span>
                {stats.needsAttention > 0 && (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                    <AlertTriangle size={11} /> {stats.needsAttention}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {actionControls}
            </div>
          </div>
        </div>

        {playbook && (
          <div className="pl-[3rem] pt-4 space-y-4 text-xs text-zinc-600 dark:text-zinc-400">
            <p className="leading-relaxed max-w-3xl">{playbook.overview}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <h4 className="font-mono font-bold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider text-[10px]">
                  Trigger &amp; Frequency
                </h4>
                <p>
                  <strong className="text-zinc-800 dark:text-zinc-300">Run mode:</strong> {playbook.trigger}
                </p>
                <p>
                  <strong className="text-zinc-800 dark:text-zinc-300">Frequency:</strong> {playbook.cadence}
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="font-mono font-bold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider text-[10px]">Key Outputs</h4>
                <div className="space-y-1">
                  {playbook.deliverables.map((item) => (
                    <div key={item} className="flex items-start gap-1.5">
                      <span className="w-2 h-2 rounded-[2.5px] shrink-0 bg-emerald-400 mt-[3px]" aria-hidden="true" />
                      <span className="text-zinc-700 dark:text-zinc-300 font-sans leading-relaxed">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <h4 className="font-mono font-bold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider text-[10px]">
                Automated Workflow Steps
              </h4>
              <div className="space-y-1">
                {playbook.workflow.map((step) => (
                  <div key={step} className="flex items-start gap-1.5">
                    <span className="w-2 h-2 rounded-[2.5px] shrink-0 bg-sky-400 mt-[3px]" aria-hidden="true" />
                    <span className="leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <p className="mt-2 pl-[3rem] text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        {enableModal}
        {gateModal}
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col justify-between rounded-lg border ${PRODUCT_ACCENT[worker.productId]} bg-white dark:bg-zinc-900/60 p-5 shadow-sm min-h-[200px]`}>
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">{worker.name}</h3>
            <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">{PRODUCT_LABELS[worker.productId]}</p>
          </div>
          {enabled && (
            <span className="shrink-0 rounded-md bg-[#4d7c4d] dark:bg-[#5c8f5c] border border-[#3f663f] dark:border-[#4d7c4d] px-2 py-0.5 text-[10px] font-semibold text-white uppercase">
              Enabled
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{worker.description}</p>

        {stats && (
          <div className="flex items-center gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 text-[11px] font-mono">
            <span className="text-zinc-600 dark:text-zinc-400">
              <strong className="text-zinc-900 dark:text-zinc-100 tabular-nums">{stats.runsInWindow}</strong> runs/7d
            </span>
            <span
              className={
                stats.successRate === null
                  ? "text-zinc-400 dark:text-zinc-600"
                  : stats.successRate >= 80
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-orange-600 dark:text-orange-400"
              }
            >
              {stats.successRate !== null ? `${stats.successRate}% success` : "No runs yet"}
            </span>
            {stats.needsAttention > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                <AlertTriangle size={11} /> {stats.needsAttention}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="pt-4 flex items-center gap-2">{actionControls}</div>
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {enableModal}
      {gateModal}
    </div>
  );
}
