"use client";

// src/components/library/product-detail-client.tsx
//
// One Worker's own page (Showtime, Reputation Manager) — where its Skills
// actually get enabled and configured. Layout ported back from the
// pre-two-tier Library page (commit afcb504's
// dashboard/library/showtime/page.tsx): a screenshot gallery, a "how a
// client moves through it" step flow, then every skill listed vertically
// underneath each other (not a card grid) — while keeping everything
// built since then: real Install/Uninstall at the Worker level, the
// Status/Categories filter sidebar, and Configure expanding inline
// exactly where you clicked it (an accordion under that skill's own row)
// instead of swapping the whole page or navigating to another one.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronDown, ChevronRight, Search, Download, Trash2, Loader2 } from "lucide-react";
import { WORKER_CATEGORY_LIST, type WorkerCategory, type WorkerDefinition, type WorkerId } from "@/lib/worker-registry";
import type { WorkerOverviewStat } from "@/lib/worker-analytics";
import { SKILL_PLAYBOOKS } from "@/lib/skill-playbooks";
import { WorkerCard } from "@/components/library/worker-card";
import { StatChip } from "@/components/library/stat-chip";
import { MediaGallery } from "@/components/library/media-gallery";
import { SkillSequence } from "@/components/library/skill-sequence";
import { LeakMapConfigForm } from "@/components/worker-config-forms/leak-map-config-form";
import { PinDownConfigForm } from "@/components/worker-config-forms/pin-down-config-form";
import { PreCallReadConfigForm } from "@/components/worker-config-forms/pre-call-read-config-form";
import { RepOnboardingConfigForm } from "@/components/worker-config-forms/rep-onboarding-config-form";
import { WinBackConfigForm } from "@/components/worker-config-forms/win-back-config-form";

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
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedWorker, setExpandedWorker] = useState<WorkerId | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "not_enabled">("all");
  const [selectedCategory, setSelectedCategory] = useState<WorkerCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [openSections, setOpenSections] = useState({ status: true, category: true });
  const toggleSection = (section: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));

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
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${installed ? "uninstall" : "install"} ${name}.`);
    } finally {
      setPending(false);
    }
  }

  function renderConfigForm(worker: WorkerDefinition) {
    if (!engagementId) return null;
    const close = () => setExpandedWorker(null);
    if (worker.id === "leak-map") return <LeakMapConfigForm engagementId={engagementId} onCancel={close} cancelLabel="Close" />;
    if (worker.id === "pre-call-read") return <PreCallReadConfigForm engagementId={engagementId} onCancel={close} cancelLabel="Close" />;
    if (worker.id === "win-back") return <WinBackConfigForm engagementId={engagementId} onCancel={close} cancelLabel="Close" />;
    if (worker.id === "rep-onboarding") return <RepOnboardingConfigForm engagementId={engagementId} onCancel={close} />;
    if (worker.id === "pin-down") {
      return (
        <PinDownConfigForm
          engagementId={engagementId}
          onCancel={close}
          onSaved={(result) => (result.runId ? router.push(`/dashboard/runs/${result.runId}`) : close())}
          cancelLabel="Close"
        />
      );
    }
    return null;
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
          <img src={image} alt={name} className="w-12 h-12 shrink-0 object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">{name}</h1>
            {installed && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                <Download size={11} className="stroke-[2.5]" /> Installed
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 max-w-2xl leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 p-4">
        <div className="flex items-center gap-6">
          <StatChip label="Skills on" value={`${enabledCount}/${workers.length}`} />
          <StatChip label="Runs (7d)" value={String(runsInWindow)} />
          <StatChip
            label="Success rate"
            value={successRate !== null ? `${successRate}%` : "—"}
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
          Not installed for this client yet — enabling any skill below installs {name} automatically, or click
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-3 space-y-5 text-xs text-zinc-700 dark:text-zinc-400">
          <div className="space-y-2.5 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => toggleSection("status")}
              className="flex items-center justify-between w-full font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px] cursor-pointer"
            >
              <span>Status</span>
              {openSections.status ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {openSections.status && (
              <div className="space-y-1.5 pt-1">
                {(
                  [
                    { id: "all", label: "All", count: workers.length },
                    { id: "enabled", label: "Enabled", count: enabledCount },
                    { id: "not_enabled", label: "Not enabled", count: workers.length - enabledCount },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.id}
                    className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                  >
                    <input
                      type="radio"
                      name="status"
                      checked={statusFilter === opt.id}
                      onChange={() => setStatusFilter(opt.id)}
                      className="accent-zinc-900 dark:accent-white focus:ring-0 cursor-pointer"
                    />
                    <span>
                      {opt.label} <span className="text-zinc-400 dark:text-zinc-600 font-mono">({opt.count})</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {categoriesInUse.length > 1 && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => toggleSection("category")}
                className="flex items-center justify-between w-full font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px] cursor-pointer"
              >
                <span>Categories</span>
                {openSections.category ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              {openSections.category && (
                <div className="space-y-1.5 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    <input
                      type="radio"
                      name="category"
                      checked={selectedCategory === "all"}
                      onChange={() => setSelectedCategory("all")}
                      className="accent-zinc-900 dark:accent-white focus:ring-0 cursor-pointer"
                    />
                    <span>All categories</span>
                  </label>
                  {categoriesInUse.map((cat) => (
                    <label
                      key={cat}
                      className="flex items-center gap-2 cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                      <input
                        type="radio"
                        name="category"
                        checked={selectedCategory === cat}
                        onChange={() => setSelectedCategory(cat)}
                        className="accent-zinc-900 dark:accent-white focus:ring-0 cursor-pointer"
                      />
                      <span>{cat}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-9 space-y-4">
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

          {filteredWorkers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No skills match these filters.
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 px-5 divide-y divide-zinc-200 dark:divide-zinc-800/80">
              {filteredWorkers.map((worker, i) => {
                const isConfiguring = expandedWorker === worker.id;
                return (
                  <div key={worker.id}>
                    <WorkerCard
                      variant="row"
                      index={i + 1}
                      worker={worker}
                      enabled={enabledSet.has(worker.id)}
                      engagementId={engagementId}
                      buyerName={buyerName}
                      stats={statsById.get(worker.id)}
                      isConfiguring={isConfiguring}
                      playbook={SKILL_PLAYBOOKS[worker.id]}
                      onToggleConfigure={
                        worker.hasHingesPanel && engagementId
                          ? () => setExpandedWorker(isConfiguring ? null : worker.id)
                          : undefined
                      }
                    />
                    {/* Accordion, not a page-wide swap — Configure opens the
                        form right under the skill you clicked it on, every
                        other skill in this list stays visible. */}
                    <div
                      className="grid overflow-hidden"
                      style={{
                        gridTemplateRows: isConfiguring ? "1fr" : "0fr",
                        transition: "grid-template-rows 280ms ease-in-out",
                      }}
                    >
                      <div className="overflow-hidden">
                        <div className="pb-5 pl-[3rem]">{isConfiguring && renderConfigForm(worker)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
