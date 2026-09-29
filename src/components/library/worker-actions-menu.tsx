"use client";

// The Library's Analytics button used to be a plain Link straight to a
// per-worker page — one destination, no way to act without leaving the
// card. This is the real context menu that replaces it: Compare (with a
// true flyout submenu for picking which other skills to compare
// against — same interaction shape as Windows' own "Send to"), Run
// analysis and Inspect performance (both render inline via onOpenPanel,
// same accordion spot Configure already uses — no navigation), and
// Visit analysis (the one destination that still leaves the card, for
// the full rebuilt per-worker page).
//
// Behaves like the top nav's Create menu: click the trigger to open, click
// anywhere outside to close. Pointing at Compare opens its flyout beside
// the row, top edges lined up; it stays open until you point at another
// row. No close timers, so nothing races when the pointer crosses the gap.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompareArrows, Activity, TrendingUp, ExternalLink, ChevronRight, ChevronLeft, ChevronDown, Loader2 } from "lucide-react";
import { useFloating, offset, flip, shift, autoUpdate, FloatingPortal } from "@floating-ui/react";
import type { WorkerId } from "@/lib/worker-registry";
import type { ProductId } from "@/lib/product-catalog";

interface EnabledWorkerOption {
  workerId: WorkerId;
  name: string;
  productId: ProductId;
}

const PRODUCT_LABELS: Record<ProductId, string> = {
  showtime: "Showtime",
  "reputation-manager": "Reputation Manager",
  "cold-open": "Cold Open",
  "whop-agent": "Whop Agent",
};

// Same look as the top nav's Create menu (itemCls / iconCls / panelCls in
// top-nav.tsx), minus its fade/zoom entrance: this menu is meant to read as
// already there when the pointer lands on the trigger.
const MENU_PANEL_CLASS = "rounded-xl surface-frost text-zinc-900 dark:text-zinc-100 font-sans antialiased";
const MENU_ITEM_CLASS =
  "group w-full flex items-center justify-between gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.06] dark:hover:bg-white/[0.08] transition-colors cursor-pointer";
const MENU_ICON_CLASS =
  "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0";

export function WorkerActionsMenu({
  workerId,
  workerName,
  engagementId,
  triggerClassName,
  onOpenPanel,
  onCompare,
}: {
  workerId: WorkerId;
  workerName: string;
  engagementId: string | null;
  triggerClassName: string;
  /** Opens the matching inline panel below the card — same spot
   * Configure's accordion already uses. */
  onOpenPanel: (panel: "run-analysis" | "inspect") => void;
  /** The confirmed Compare picker selection (always includes this
   * card's own workerId). */
  onCompare: (workerIds: WorkerId[]) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [options, setOptions] = useState<EnabledWorkerOption[] | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selected, setSelected] = useState<Set<WorkerId>>(() => new Set([workerId]));
  // Which product's own skill list is currently expanded in the picker —
  // grouped by worker/product first (4 rows, always short) rather than
  // one flat list of every enabled skill across every product, which
  // stops making sense once a client has more than a couple installed.
  // Defaults open on this card's own product so its sibling skills are
  // visible without an extra click.
  const [expandedProduct, setExpandedProduct] = useState<ProductId | null>(null);

  const groupedOptions = useMemo(() => {
    const groups = new Map<ProductId, EnabledWorkerOption[]>();
    for (const opt of options ?? []) {
      const list = groups.get(opt.productId) ?? [];
      list.push(opt);
      groups.set(opt.productId, list);
    }
    return Array.from(groups.entries());
  }, [options]);

  const { refs, floatingStyles } = useFloating({
    open,
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    // flip only moves the menu above the button when there is no room below.
    middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
  });

  const {
    refs: subRefs,
    floatingStyles: subFloatingStyles,
    placement: comparePlacement,
  } = useFloating({
    open: compareOpen,
    placement: "right-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      // Lines the flyout's top edge up with the menu's top edge (the menu
      // has 6px of padding above the Compare row), like Create's flyouts.
      offset({ mainAxis: 6, alignmentAxis: -6 }),
      // Only ever swaps sides (right to left); never jumps above or below.
      flip({ padding: 12, crossAxis: false }),
      shift({ padding: 12 }),
    ],
  });
  // flip() can resolve to "left-start" when there's no room on the right
  // (a card near the viewport's right edge) — the trigger row's chevron
  // needs to point the same direction the flyout actually lands in, or it
  // reads as a UI bug (arrow says right, panel appears on the left).
  const compareOpensLeft = comparePlacement.startsWith("left");

  function closeAll() {
    setOpen(false);
    setCompareOpen(false);
  }

  function openCompareFlyout() {
    setCompareOpen(true);
    if (options || !engagementId) return;
    setLoadingOptions(true);
    fetch(`/api/engagements/${engagementId}/enabled-workers`)
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        const workers: EnabledWorkerOption[] = Array.isArray(data.workers) ? data.workers : [];
        setOptions(workers);
        const ownProduct = workers.find((w) => w.workerId === workerId)?.productId;
        if (ownProduct) setExpandedProduct(ownProduct);
      })
      .finally(() => setLoadingOptions(false));
  }

  // Pointing at any other row closes the flyout, like Create's "leaf" rows.
  const leaf = { onMouseEnter: () => setCompareOpen(false) };

  function toggleOption(id: WorkerId) {
    if (id === workerId) return; // this card's own skill is always included
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmCompare() {
    if (selected.size < 2) return;
    onCompare(Array.from(selected));
    closeAll();
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={refs.setReference}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? closeAll() : setOpen(true))}
        title="Analytics"
        className={triggerClassName}
      >
        <TrendingUp size={16} />
      </button>

      {open && (
        <FloatingPortal>
          <div className="fixed inset-0 z-[9990]" onClick={closeAll} />
          <div ref={refs.setFloating} style={floatingStyles} role="menu" className={`z-[9991] w-64 p-1.5 ${MENU_PANEL_CLASS}`}>
            <button
              ref={subRefs.setReference}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={compareOpen}
              onMouseEnter={openCompareFlyout}
              onClick={(e) => {
                e.stopPropagation();
                if (compareOpen) setCompareOpen(false);
                else openCompareFlyout();
              }}
              className={`${MENU_ITEM_CLASS} ${compareOpen ? "bg-zinc-900/[0.06] dark:bg-white/[0.08]" : ""}`}
            >
              <span className="flex items-center gap-2.5">
                <GitCompareArrows size={16} className={MENU_ICON_CLASS} /> Compare
              </span>
              {compareOpensLeft ? (
                <ChevronLeft size={12} className="text-zinc-400 dark:text-zinc-600" />
              ) : (
                <ChevronRight size={12} className="text-zinc-400 dark:text-zinc-600" />
              )}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenPanel("run-analysis");
                closeAll();
              }}
              className={MENU_ITEM_CLASS}
              {...leaf}
            >
              <span className="flex items-center gap-2.5">
                <Activity size={16} className={MENU_ICON_CLASS} /> Run analysis
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                router.push(`/dashboard/analytics/${workerId}`);
                closeAll();
              }}
              className={MENU_ITEM_CLASS}
              {...leaf}
            >
              <span className="flex items-center gap-2.5">
                <ExternalLink size={16} className={MENU_ICON_CLASS} /> Visit analysis
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenPanel("inspect");
                closeAll();
              }}
              className={MENU_ITEM_CLASS}
              {...leaf}
            >
              <span className="flex items-center gap-2.5">
                <TrendingUp size={16} className={MENU_ICON_CLASS} /> Inspect performance
              </span>
            </button>
          </div>
        </FloatingPortal>
      )}

      {compareOpen && (
        <FloatingPortal>
          <div
            ref={subRefs.setFloating}
            style={subFloatingStyles}
            role="menu"
            aria-label={`Compare ${workerName} with`}
            onClick={(e) => e.stopPropagation()}
            className={`z-[9992] w-64 p-3 ${MENU_PANEL_CLASS}`}
          >
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-600 mb-2">
              Compare {workerName} with
            </p>
            {loadingOptions ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="space-y-0.5 max-h-72 overflow-y-auto">
                {groupedOptions.map(([productId, skills]) => {
                  const isExpanded = expandedProduct === productId;
                  const selectedInProduct = skills.filter((s) => selected.has(s.workerId)).length;
                  return (
                    <div key={productId}>
                      <button
                        type="button"
                        onClick={() => setExpandedProduct(isExpanded ? null : productId)}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.06] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          {PRODUCT_LABELS[productId]}
                          {selectedInProduct > 0 && (
                            <span className="text-[10px] font-mono font-normal text-amber-600 dark:text-amber-400">{selectedInProduct} picked</span>
                          )}
                        </span>
                        {isExpanded ? (
                          <ChevronDown size={12} className="text-zinc-400 dark:text-zinc-600 shrink-0" />
                        ) : (
                          <ChevronRight size={12} className="text-zinc-400 dark:text-zinc-600 shrink-0" />
                        )}
                      </button>
                      {isExpanded && (
                        <div className="pl-2 space-y-0.5 py-0.5">
                          {skills.map((opt) => {
                            const isSelf = opt.workerId === workerId;
                            return (
                              <label
                                key={opt.workerId}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                                  isSelf
                                    ? "text-zinc-400 dark:text-zinc-600 cursor-default"
                                    : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-900/[0.06] dark:hover:bg-white/[0.08] cursor-pointer"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.has(opt.workerId)}
                                  disabled={isSelf}
                                  onChange={() => toggleOption(opt.workerId)}
                                  className="accent-amber-500"
                                />
                                {opt.name}
                                {isSelf && <span className="text-[10px] text-zinc-400 dark:text-zinc-600">(this skill)</span>}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {groupedOptions.length === 0 && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 px-2 py-1.5">No other enabled skills yet.</p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={confirmCompare}
              disabled={selected.size < 2}
              className="w-full mt-2 text-xs font-bold rounded-lg px-3 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Compare {selected.size} selected
            </button>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}
