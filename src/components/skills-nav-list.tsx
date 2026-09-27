"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, MoreHorizontal, Plus, Settings } from "lucide-react";
import { hasSkillSettings } from "@/lib/skill-settings/schema";
import { useSkillPane } from "@/components/skill-settings/skill-pane-context";
import { useOpenSkillSettings } from "@/app/dashboard/engagements/[id]/skill-configure-menu";
import { PRODUCT_IDS, type ProductId } from "@/lib/product-catalog";
import { PRODUCT_ONBOARDING_WORKER_ID, WORKER_REGISTRY, workersForProduct, workerPrimaryHref, type WorkerId } from "@/lib/worker-registry";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { SidebarNavLinks, type NavLinkItem } from "@/app/dashboard/sidebar-nav-links";
import { ActionMenu, ActionMenuSection } from "@/components/action-menu";

interface SkillEntry {
  skillId: WorkerId;
  href: string;
  label: string;
}

// Fix: this used to special-case "showtime" and treat every other
// productId as Reputation Manager — harmless while those were the only
// two products, but Cold Open (a real installable product, see
// product-catalog.ts) silently got REP_SKILL_IDS entries instead of its
// own, duplicating Reputation Manager's skills and never showing Cold
// Open's. workersForProduct already knows every product's real skills.
function buildEntries(productIds: ProductId[]): SkillEntry[] {
  return productIds.flatMap((productId) =>
    workersForProduct(productId).map(
      (worker): SkillEntry => ({
        skillId: worker.id,
        href: `/dashboard/modules/${worker.id}`,
        label: worker.name,
      })
    )
  );
}

const PRODUCT_PATHS: Record<string, ProductId> = {
  "/dashboard/showtime": "showtime",
  "/dashboard/reputation-manager": "reputation-manager",
};

/** The product whose page this is, so its row starts open. */
export function productForPath(pathname: string): ProductId | null {
  const skill = pathname.match(/\/skills\/([^/?#]+)/)?.[1] ?? pathname.match(/\/bridges\/([^/?#]+)/)?.[1];
  if (skill && skill in WORKER_REGISTRY) return WORKER_REGISTRY[skill as WorkerId].productId as ProductId;
  if (skill === "reputation-manager") return "reputation-manager";
  if (skill === "cold-open") return "cold-open";
  const library = pathname.match(/^\/dashboard\/library\/([^/?#]+)/)?.[1];
  if (library && (PRODUCT_IDS as readonly string[]).includes(library)) return library as ProductId;
  for (const [prefix, product] of Object.entries(PRODUCT_PATHS)) if (pathname.startsWith(prefix)) return product;
  return null;
}

/**
 * "Enabled Skills": one row per product with how many of its skills are on
 * ("Whop Agent · 15 on"), tinted red with a count when one of them failed
 * its last run — no separate dot/pill, just the same status-error color
 * the rest of the app already uses for a failed run. A row opens to its
 * skills as plain links, each to that skill's own page; the product being
 * looked at starts open. The sidebar stays the same height however many
 * skills a client runs.
 *
 * Each product row also carries a "…" kebab (the app's ActionMenu, as on
 * the workspace card) with one entry: the product's setup page, e.g.
 * bridges/pin-down for Showtime (PRODUCT_ONBOARDING_WORKER_ID). A product
 * has one setup page; each skill's own settings are its Configure.
 *
 * Nothing is switched on or off here: that's the client page and the
 * Library, which show what each switch does. This is for getting to a
 * skill, or to its setup.
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
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);
  // A skill's gear opens its settings at the app's right edge, like
  // Teammates, without leaving the page (a page of its own on a phone).
  const pane = useSkillPane();
  const openSettings = useOpenSkillSettings();
  // Rows the person opened or closed; any other row follows the page.
  const [toggled, setToggled] = useState<Partial<Record<ProductId, boolean>>>({});
  const current = productForPath(pathname);

  const groups = PRODUCT_IDS.map((productId) => ({
    productId,
    product: WORKSPACE_PRODUCTS.find((p) => p.id === productId),
    skills: entries.filter((e) => WORKER_REGISTRY[e.skillId].productId === productId),
  })).filter((g) => g.skills.length > 0);

  const header = (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex flex-1 min-w-0 items-center gap-1.5 text-[13px] font-bold text-zinc-600 dark:text-zinc-300 tracking-tight cursor-pointer"
      >
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        <span>Enabled Skills</span>
      </button>
      <Link
        href="/dashboard/library"
        title="Enable a new skill"
        aria-label="Enable a new skill"
        className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </Link>
    </div>
  );

  // CSS-only accordion: a 0fr/1fr grid-template-rows transition animates
  // height from 0 to content-height without knowing that height ahead of
  // time — the content always stays mounted (inside overflow-hidden), only
  // its allotted row height animates.
  return (
    <div className="space-y-1">
      {header}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
        <div className="overflow-hidden">
          {groups.length === 0 ? (
            <Link
              href="/dashboard/library"
              className="block rounded-[10px] border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-3 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
            >
              No skills are on for this client yet. Turn one on in the Library.
            </Link>
          ) : (
            <ul className="space-y-0.5">
              {groups.map(({ productId, product, skills }) => {
                const open = toggled[productId] ?? productId === current;
                const failing = skills.filter((s) => needsAttentionWorkerIds?.has(s.skillId)).length;
                const name = product?.name ?? productId;
                const setupWorker = PRODUCT_ONBOARDING_WORKER_ID[productId];
                return (
                  <li key={productId}>
                    <div className="flex w-full items-center gap-1 rounded-lg pr-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
                      <button
                        type="button"
                        onClick={() => setToggled((t) => ({ ...t, [productId]: !open }))}
                        aria-expanded={open}
                        className="flex flex-1 min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-zinc-700 dark:text-zinc-300 cursor-pointer"
                      >
                        <ChevronRight className={`h-3 w-3 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} />
                        {product?.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a static product mark, same as the Library's
                          <img src={product.image} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate font-medium" title={name}>
                          {name}
                        </span>
                        {/* How many are on, as a small badge; red with a mark when one failed its last run. */}
                        <span
                          title={failing > 0 ? `${skills.length} on · ${failing} failed ${failing === 1 ? "its" : "their"} last run` : `${skills.length} on`}
                          aria-label={failing > 0 ? `${skills.length} on, ${failing} failing` : `${skills.length} on`}
                          className={`inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center gap-0.5 rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums ${
                            failing > 0
                              ? "bg-rose-500/12 text-rose-600 ring-1 ring-inset ring-rose-500/25 dark:bg-rose-500/15 dark:text-rose-400"
                              : "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {failing > 0 && <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />}
                          {skills.length}
                        </span>
                      </button>
                      {engagementId && setupWorker && (
                        <ActionMenu
                          align="end"
                          panelWidth={240}
                          panelClassName="rounded-lg"
                          trigger={({ toggle, open: menuOpen }) => (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggle();
                              }}
                              aria-expanded={menuOpen}
                              aria-haspopup="menu"
                              aria-label={`Setup for ${name}`}
                              title="Setup"
                              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          )}
                        >
                          <ActionMenuSection label={name}>
                            <Link
                              href={`/dashboard/engagements/${engagementId}/bridges/${setupWorker}`}
                              className="group/setup flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors select-none cursor-pointer hover-lift press-settle hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                            >
                              <AnySkillBadge skill={setupWorker} size={18} />
                              <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                                {WORKER_REGISTRY[setupWorker].name}
                              </span>
                              <span className="shrink-0 text-[11px] text-zinc-400 group-hover/setup:text-zinc-700 dark:group-hover/setup:text-zinc-200">
                                View setup
                              </span>
                            </Link>
                          </ActionMenuSection>
                        </ActionMenu>
                      )}
                    </div>
                    {open && (
                      <ul className="mb-1 ml-[22px] border-l border-zinc-200 pl-2 dark:border-zinc-800">
                        {skills.map((entry) => {
                          const href = engagementId ? workerPrimaryHref(entry.skillId, engagementId) : null;
                          const here = Boolean(href) && pathname.startsWith(href!.split("?")[0]);
                          const needsAttention = needsAttentionWorkerIds?.has(entry.skillId) ?? false;
                          const label = (
                            <>
                              <AnySkillBadge skill={entry.skillId} size={16} />
                              <span className={`min-w-0 flex-1 truncate ${needsAttention ? "text-status-error" : ""}`}>{entry.label}</span>
                            </>
                          );
                          const settingsOpen = pane?.current?.skillId === entry.skillId && pane.current.engagementId === engagementId;
                          const gear =
                            engagementId && hasSkillSettings(entry.skillId) ? (
                              <button
                                type="button"
                                onClick={() => (settingsOpen ? pane?.close() : openSettings(engagementId, entry.skillId))}
                                aria-pressed={settingsOpen}
                                aria-label={`${entry.label} settings`}
                                title="Settings"
                                className={`mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
                                  settingsOpen
                                    ? "bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                                    : "text-zinc-400 opacity-60 group-hover/skill:opacity-100 focus-visible:opacity-100 hover:bg-zinc-200/70 hover:text-zinc-900 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-200"
                                }`}
                              >
                                <Settings className="h-3.5 w-3.5" />
                              </button>
                            ) : null;
                          return (
                            <li key={entry.skillId} className="group/skill flex items-center">
                              <div className="min-w-0 flex-1">
                              {href ? (
                                <Link
                                  href={href}
                                  aria-current={here ? "page" : undefined}
                                  title={needsAttention ? `${entry.label} failed its last run` : undefined}
                                  className={`flex items-center gap-2 rounded-md px-2 py-1 text-[12.5px] transition-colors ${
                                    here
                                      ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800/70 dark:text-white"
                                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
                                  }`}
                                >
                                  {label}
                                </Link>
                              ) : (
                                <span
                                  title={needsAttention ? `${entry.label} failed its last run` : undefined}
                                  className="flex items-center gap-2 px-2 py-1 text-[12.5px] text-zinc-500"
                                >
                                  {label}
                                </span>
                              )}
                              </div>
                              {gear}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
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
    icon: <AnySkillBadge skill={entry.skillId} size={18} />,
  }));

  return <SidebarNavLinks links={links} />;
}
