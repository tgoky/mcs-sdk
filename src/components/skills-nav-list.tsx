"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Settings2, BarChart3 } from "lucide-react";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { REP_SKILL_IDS, REP_SKILL_MANIFEST, type RepSkillId } from "@/lib/rep-skill-manifest";
import type { ProductId } from "@/lib/product-catalog";
import { WORKER_REGISTRY, workerPrimaryHref, type WorkerId } from "@/lib/worker-registry";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { RepSkillBadge } from "@/components/rep-skill-badge";
import { SidebarNavLinks, type NavLinkItem } from "@/app/dashboard/sidebar-nav-links";

interface SkillEntry {
  skillId: WorkerId;
  href: string;
  label: string;
  isRep: boolean;
}

function buildEntries(productIds: ProductId[]): SkillEntry[] {
  return productIds.flatMap((productId) => {
    if (productId === "showtime") {
      return SKILL_IDS.map(
        (skillId): SkillEntry => ({
          skillId,
          href: `/dashboard/modules/${skillId}`,
          label: SKILL_MANIFEST[skillId].name,
          isRep: false,
        })
      );
    }

    return REP_SKILL_IDS.map(
      (skillId): SkillEntry => ({
        skillId,
        href: `/dashboard/modules/${skillId}`,
        label: REP_SKILL_MANIFEST[skillId].name,
        isRep: true,
      })
    );
  });
}

function toggleEndpoint(engagementId: string, workerId: WorkerId): string {
  return WORKER_REGISTRY[workerId].productId === "reputation-manager"
    ? `/api/engagements/${engagementId}/skills/rep/${workerId}`
    : `/api/engagements/${engagementId}/skills/${workerId}`;
}

/**
 * "Installed Skills" — Since-audit rebuild. Used to be a static, read-only
 * icon grid whose only action was "click to navigate to
 * /dashboard/modules/[skill]" (a roster page that's now itself a
 * redirect — see that file's own header). Rebuilt as real, interactive
 * rows matching the toggle-first pattern AutopilotTable already
 * established elsewhere in this app: a working on/off switch (the same
 * enable/disable endpoint WorkersPanel's own toggle calls), a Configure
 * icon, and a View (analytics) icon.
 *
 * Deliberately NOT a second place to *enable* a new skill — this only
 * ever lists what's already on, and turning one off here just drops it
 * from this list (Library is still where a skill gets turned on in the
 * first place; keeping that one job in one place is the whole point of
 * this pass).
 *
 * Configure and View are real navigations, not WorkersPanel's inline
 * expand — the sidebar is 240px wide, nowhere near enough room for any
 * of the five config forms (multi-column layouts, a template-picker
 * grid), so this doesn't try to force that pattern where it structurally
 * can't fit, same conclusion already reached before this rebuild.
 */
function InstalledSkillsList({
  entries,
  engagementId,
  needsAttentionWorkerIds,
}: {
  entries: SkillEntry[];
  engagementId: string | null;
  needsAttentionWorkerIds?: Set<string>;
}) {
  const [removedIds, setRemovedIds] = useState<Set<WorkerId>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<WorkerId>>(new Set());
  const [errorId, setErrorId] = useState<WorkerId | null>(null);
  const visible = entries.filter((entry) => !removedIds.has(entry.skillId));

  async function disable(workerId: WorkerId) {
    if (!engagementId) return;
    setBusyIds((prev) => new Set(prev).add(workerId));
    setErrorId(null);
    try {
      const res = await fetch(toggleEndpoint(engagementId, workerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      if (!res.ok) throw new Error("Failed to turn off");
      setRemovedIds((prev) => new Set(prev).add(workerId));
    } catch {
      setErrorId(workerId);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(workerId);
        return next;
      });
    }
  }

  if (visible.length === 0) {
    return (
      <Link
        href="/dashboard/library"
        className="block rounded-[10px] border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-3 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
      >
        No skills installed yet — visit the Library to turn one on.
      </Link>
    );
  }

  return (
    <div className="space-y-0.5">
      {visible.map((entry) => {
        const worker = WORKER_REGISTRY[entry.skillId];
        const needsAttention = needsAttentionWorkerIds?.has(entry.skillId) ?? false;
        const busy = busyIds.has(entry.skillId);
        const viewHref = engagementId ? workerPrimaryHref(entry.skillId, engagementId) : null;
        const configureHref =
          worker.hasHingesPanel && engagementId ? `/dashboard/engagements/${engagementId}/bridges/${entry.skillId}` : null;
        const analyticsHref = `/dashboard/analytics/${entry.skillId}`;

        return (
          <div
            key={entry.skillId}
            className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-[#f0edf6] dark:hover:bg-zinc-800/60 transition-colors"
          >
            {entry.isRep ? (
              <RepSkillBadge skill={entry.skillId as RepSkillId} size={18} />
            ) : (
              <SquishySkillBadge skill={entry.skillId} size={18} />
            )}

            {viewHref ? (
              <Link
                href={viewHref}
                title={needsAttention ? `${entry.label} — failing on its most recent run` : entry.label}
                className="min-w-0 flex-1 flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors truncate"
              >
                <span className="truncate">{entry.label}</span>
                {needsAttention && <AlertTriangle size={11} className="shrink-0 text-rose-500 dark:text-rose-400" />}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{entry.label}</span>
            )}

            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              {configureHref && (
                <Link
                  href={configureHref}
                  title={`Configure ${entry.label}`}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  <Settings2 size={12} />
                </Link>
              )}
              <Link
                href={analyticsHref}
                title={`${entry.label} analytics`}
                className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                <BarChart3 size={12} />
              </Link>
            </div>

            <button
              type="button"
              onClick={() => !busy && disable(entry.skillId)}
              disabled={busy || !engagementId}
              aria-label={`Turn off ${entry.label}`}
              aria-pressed={true}
              className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 focus:outline-none bg-amber-400 dark:bg-amber-500 shadow-[0_0_6px_rgba(251,191,36,0.3)] ${
                busy ? "opacity-50" : ""
              }`}
            >
              {busy ? (
                <Loader2 size={10} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
              ) : (
                <span className="inline-block h-2.5 w-2.5 translate-x-[11px] transform rounded-full bg-white shadow-xs transition-transform duration-200" />
              )}
            </button>

            {errorId === entry.skillId && (
              <p className="w-full text-[10px] text-rose-600 dark:text-rose-400 pl-1">Couldn&apos;t turn off — try again.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * "Jump to a skill" — every skill this workspace has, linking to
 * /dashboard/modules/[skill] in the (now dead, layout="list" only)
 * legacy path. `layout="grid"` (WorkSidebar's only live call today) has
 * been rebuilt as InstalledSkillsList above — see its own header for why
 * it stopped being a static grid.
 */
export function SkillsNavList({
  productIds = ["showtime"],
  layout = "list",
  enabledWorkerIds,
  needsAttentionWorkerIds,
  engagementId = null,
}: {
  productIds?: ProductId[];
  layout?: "list" | "grid";
  /**
   * When provided, restricts the rendered entries to this set — the grid
   * layout's actual job is "jump into what's already running," not
   * "browse the full catalog" (that's the Library). Omitted entirely for
   * a product's own list-layout sidebar, which still shows every skill in
   * that product's catalog on purpose — a product's own nav is meant to
   * be a full skill directory, not a quick-access shortlist.
   */
  enabledWorkerIds?: WorkerId[];
  /** A small warning icon on any skill failing on its most recent run
   * (from getWorkspaceWorkerOverview), folded in from the dashboard-home
   * "Active Workers" panel this list absorbed. */
  needsAttentionWorkerIds?: Set<string>;
  /** Required for the grid/InstalledSkillsList layout's toggle, Configure,
   * and View actions — the list layout doesn't use it (its own callers
   * are all dead code today; kept working rather than deleted). */
  engagementId?: string | null;
}) {
  const allEntries = buildEntries(productIds);
  const entries = enabledWorkerIds
    ? allEntries.filter((entry) => (enabledWorkerIds as string[]).includes(entry.skillId))
    : allEntries;

  if (layout === "grid") {
    return <InstalledSkillsList entries={entries} engagementId={engagementId} needsAttentionWorkerIds={needsAttentionWorkerIds} />;
  }

  const links: NavLinkItem[] = entries.map((entry) => ({
    href: entry.href,
    label: entry.label,
    icon: entry.isRep ? <RepSkillBadge skill={entry.skillId as RepSkillId} size={18} /> : <SquishySkillBadge skill={entry.skillId} size={18} />,
  }));

  return <SidebarNavLinks links={links} />;
}
