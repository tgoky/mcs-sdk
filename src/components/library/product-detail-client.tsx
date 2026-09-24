"use client";

// src/components/library/product-detail-client.tsx
//
// One Worker's own page (Showtime, Reputation Manager) — where its Skills
// actually get enabled and configured. Layout ported back from the
// pre-two-tier Library page (commit afcb504's
// dashboard/library/showtime/page.tsx): a screenshot gallery, a "how a
// client moves through it" step flow, then every skill listed vertically
// underneath each other (not a card grid) — while keeping everything
// built since then: real Install/Uninstall at the Worker level. Status/
// Categories filtering is a SegmentedTabs row above the list (not a
// sidebar) so the skill list itself gets the page's full width. Configure
// opens as a floating dropdown (SkillConfigureMenu, the same one every
// individual skill page already uses) anchored to that row's own gear
// icon — it used to swap the whole row for the form inline, which hid
// "Skill Execution Guidelines" (the rest of the list) behind it; a
// dropdown never covers the list it opened from.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Search, Download, Trash2, Loader2 } from "lucide-react";
import { WORKER_CATEGORY_LIST, workerSettingsFormId, type WorkerCategory, type WorkerDefinition } from "@/lib/worker-registry";
import type { WorkerOverviewStat } from "@/lib/worker-analytics";
import { SKILL_PLAYBOOKS } from "@/lib/skill-playbooks";
import { hasWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { WorkerCard, WORKER_CARD_ICON_BUTTON_CLASS } from "@/components/library/worker-card";
import { StatChip } from "@/components/library/stat-chip";
import { MediaGallery } from "@/components/library/media-gallery";
import { SkillSequence } from "@/components/library/skill-sequence";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { SkillConfigureMenu } from "@/app/dashboard/engagements/[id]/skill-configure-menu";
import { useToast } from "@/components/toast/toast-provider";

export function ProductDetailClient({
  productId,
  name,
  description,
  image,
  installed,
  workers,
  enabledWorkerIds,
  workerStats,
  engagementId,
  buyerName,
  productOnboarded = true,
  productOnboardingSkipDismissed = false,
  completenessByWorkerId = {},
}: {
  productId: string;
  name: string;
  description: string;
  /** Real artwork from WORKSPACE_PRODUCTS (copy.ts) — same hero image the
   * Library grid's ProductCard shows, carried onto this page's own header
   * so the "app store" look is consistent one level deep too. */
  image: string;
  installed: boolean;
  workers: WorkerDefinition[];
  enabledWorkerIds: string[];
  workerStats: WorkerOverviewStat[];
  engagementId: string | null;
  buyerName?: string | null;
  /** Whether THIS product's own onboarding worker has actually run for
   * this engagement — see src/lib/product-onboarding.ts. Every worker on
   * this page shares one value since they're all the same product. */
  productOnboarded?: boolean;
  productOnboardingSkipDismissed?: boolean;
  /** Real capability completeness per worker (worker-capability-status.ts's
   * getWorkerCompletenessSummaries) — lets a card's "Enabled" badge tell
   * "on and working" from "on and broken" apart, instead of showing the
   * same green badge either way. Absent entries (only 13 of 34 workers
   * have real WORKER_CAPABILITIES data today, or there's no active
   * engagement) mean the card falls back to today's plain badge. */
  completenessByWorkerId?: Record<string, { activeCount: number; totalCount: number }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "not_enabled">("all");
  const [selectedCategory, setSelectedCategory] = useState<WorkerCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const enabledSet = new Set(enabledWorkerIds);
  const statsById = new Map(workerStats.map((s) => [s.workerId, s]));
  const enabledCount = workers.filter((w) => enabledSet.has(w.id)).length;
  const runsInWindow = workers.reduce((sum, w) => sum + (statsById.get(w.id)?.runsInWindow ?? 0), 0);
  const rates = workers.map((w) => statsById.get(w.id)?.successRate).filter((r): r is number => r !== null && r !== undefined);
  const successRate = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;

  // Gallery and sequence are an always-visible orientation for the whole
  // worker — real screenshots only exist for Showtime's 5 skills today
  // (see skill-playbooks.ts), so a worker with none just doesn't render
  // a gallery rather than show broken tiles.
  const galleryItems = useMemo(
    () =>
      workers
        .filter((w) => SKILL_PLAYBOOKS[w.id]?.image)
        .map((w) => ({ id: w.id, name: w.name, badge: SKILL_PLAYBOOKS[w.id]!.badge, image: SKILL_PLAYBOOKS[w.id]!.image })),
    [workers]
  );

  const categoriesInUse = useMemo(
    () => WORKER_CATEGORY_LIST.filter((cat) => workers.some((w) => w.category === cat)),
    [workers]
  );

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (statusFilter === "enabled" && !enabledSet.has(w.id)) return false;
      if (statusFilter === "not_enabled" && enabledSet.has(w.id)) return false;
      if (selectedCategory !== "all" && w.category !== selectedCategory) return false;
      if (searchQuery.trim() && !w.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, statusFilter, selectedCategory, searchQuery, enabledWorkerIds]);

  async function toggleInstalled() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/packages/${productId}`, { method: installed ? "DELETE" : "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Could not ${installed ? "uninstall" : "install"} ${name}.`);
      toast.success(`${name} ${installed ? "uninstalled" : "installed"}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${installed ? "uninstall" : "install"} ${name}.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8 font-sans antialiased">
      <div className="flex items-start gap-3">
        <Link
          href="/dashboard/library"
          className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0 mt-0.5"
          aria-label="Back to Library"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name} className="w-14 h-14 shrink-0 object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">{name}</h1>
            {installed && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-900 bg-amber-400 dark:bg-amber-400 border border-amber-500 px-2 py-0.5 rounded-md">
                <Download size={11} className="stroke-[2.5]" /> Installed
              </span>
            )}
          </div>
          <p className="text-[15px] text-zinc-600 dark:text-zinc-400 mt-1.5 max-w-2xl leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-200 dark:border-zinc-800/80 bg-transparent p-4">
        <div className="flex items-center gap-6">
          <StatChip label="Skills on" value={`${enabledCount}/${workers.length}`} />
          <StatChip label="Runs (7d)" value={String(runsInWindow)} />
          <StatChip
            label="Success rate"
            value={successRate !== null ? `${successRate}%` : "No data"}
            tone={successRate === null ? "neutral" : successRate >= 80 ? "success" : "warning"}
          />
        </div>

        <button
          type="button"
          onClick={toggleInstalled}
          disabled={pending}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
            installed
              ? "border border-border bg-zinc-50 dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-300 dark:hover:border-rose-800 hover:text-rose-700 dark:hover:text-rose-300 text-zinc-700 dark:text-zinc-200"
              : "bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900"
          }`}
        >
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : installed ? (
            <Trash2 size={13} />
          ) : (
            <Download size={13} />
          )}
          {pending ? (installed ? "Uninstalling…" : "Installing…") : installed ? "Uninstall" : "Install"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {!installed && (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
          Not installed for this client yet. Enabling any skill below installs {name} automatically, or click
          Install above to do it explicitly first.
        </div>
      )}

      {galleryItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
            Interface &amp; Workflow Previews ({galleryItems.length})
          </h2>
          <MediaGallery items={galleryItems} />
        </div>
      )}

      {workers.length > 1 && (
        <div className="space-y-3">
          <h2 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
            How a client moves through it
          </h2>
          <SkillSequence workers={workers} statsById={statsById} />
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Skill Execution Guidelines</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {filteredWorkers.length} {filteredWorkers.length === 1 ? "skill" : "skills"}
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-border focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-tour="product-status-tabs">
          <SegmentedTabs<"all" | "enabled" | "not_enabled">
            options={[
              { key: "all", label: "All", count: workers.length },
              { key: "enabled", label: "Enabled", count: enabledCount },
              { key: "not_enabled", label: "Not enabled", count: workers.length - enabledCount },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          {categoriesInUse.length > 1 && (
            <SegmentedTabs<WorkerCategory | "all">
              options={[
                { key: "all", label: "All categories" },
                ...categoriesInUse.map((cat) => ({ key: cat, label: cat })),
              ]}
              value={selectedCategory}
              onChange={setSelectedCategory}
            />
          )}
        </div>

        {filteredWorkers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No skills match these filters.
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 px-5 divide-y divide-zinc-200 dark:divide-zinc-800/80 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200" data-tour="product-skill-list">
            {filteredWorkers.map((worker, i) => {
              const formId = workerSettingsFormId(worker.id);
              const canConfigure = Boolean(engagementId && formId && hasWorkerConfigForm(formId));
              return (
                <WorkerCard
                  key={worker.id}
                  variant="row"
                  index={i + 1}
                  worker={worker}
                  enabled={enabledSet.has(worker.id)}
                  engagementId={engagementId}
                  buyerName={buyerName}
                  stats={statsById.get(worker.id)}
                  playbook={SKILL_PLAYBOOKS[worker.id]}
                  configureMenu={
                    canConfigure && engagementId && formId ? (
                      <SkillConfigureMenu skillId={formId} engagementId={engagementId} triggerClassName={WORKER_CARD_ICON_BUTTON_CLASS} iconSize={16} />
                    ) : undefined
                  }
                  productOnboarded={productOnboarded}
                  productOnboardingSkipDismissed={productOnboardingSkipDismissed}
                  completeness={completenessByWorkerId[worker.id]}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
