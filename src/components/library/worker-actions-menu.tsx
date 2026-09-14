"use client";

// The Library's Analytics button used to be a plain Link straight to a
// per-worker page — one destination, no way to act without leaving the
// card. This is the real context menu that replaces it: Compare (with a
// true flyout submenu for picking which other skills to compare
// against — same interaction shape as Windows' own "Send to", click-
// triggered rather than hover-triggered so picking multiple checkboxes
// doesn't fight the menu closing under your cursor), Run analysis and
// Inspect performance (both render inline via onOpenPanel, same
// accordion spot Configure already uses — no navigation), and Visit
// analysis (the one destination that still leaves the card, for the
// full rebuilt per-worker page).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompareArrows, Activity, TrendingUp, ExternalLink, ChevronRight, Loader2 } from "lucide-react";
import { useFloating, offset, flip, shift, autoUpdate, FloatingPortal } from "@floating-ui/react";
import type { WorkerId } from "@/lib/worker-registry";

interface EnabledWorkerOption {
  workerId: WorkerId;
  name: string;
  productId: string;
}

const MENU_ITEM_CLASS =
  "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer";

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

  const { refs, floatingStyles } = useFloating({
    open,
    onOpenChange: (next) => {
      setOpen(next);
      if (!next) setCompareOpen(false);
    },
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
  });

  const { refs: subRefs, floatingStyles: subFloatingStyles } = useFloating({
    open: compareOpen,
    placement: "right-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
  });

  function closeAll() {
    setOpen(false);
    setCompareOpen(false);
  }

  async function toggleCompareFlyout() {
    setCompareOpen((v) => !v);
    if (options || !engagementId) return;
    setLoadingOptions(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/enabled-workers`);
      const data = await res.json().catch(() => ({}));
      setOptions(Array.isArray(data.workers) ? data.workers : []);
    } finally {
      setLoadingOptions(false);
    }
  }

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
        onClick={() => setOpen((v) => !v)}
        title="Analytics"
        className={triggerClassName}
      >
        <TrendingUp size={16} />
      </button>

      {open && (
        <FloatingPortal>
          <div className="fixed inset-0 z-[9990]" onClick={closeAll} />
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[9991] w-56 rounded-lg border border-border bg-background shadow-2xl py-1.5 font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
          >
            <button
              ref={subRefs.setReference}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleCompareFlyout();
              }}
              className={MENU_ITEM_CLASS}
            >
              <span className="flex items-center gap-2">
                <GitCompareArrows size={13} className="text-zinc-400 dark:text-zinc-500" /> Compare
              </span>
              <ChevronRight size={12} className="text-zinc-400 dark:text-zinc-600" />
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenPanel("run-analysis");
                closeAll();
              }}
              className={MENU_ITEM_CLASS}
            >
              <span className="flex items-center gap-2">
                <Activity size={13} className="text-zinc-400 dark:text-zinc-500" /> Run analysis
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                router.push(`/dashboard/analytics/${workerId}`);
                closeAll();
              }}
              className={MENU_ITEM_CLASS}
            >
              <span className="flex items-center gap-2">
                <ExternalLink size={13} className="text-zinc-400 dark:text-zinc-500" /> Visit analysis
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenPanel("inspect");
                closeAll();
              }}
              className={MENU_ITEM_CLASS}
            >
              <span className="flex items-center gap-2">
                <TrendingUp size={13} className="text-zinc-400 dark:text-zinc-500" /> Inspect performance
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
            onClick={(e) => e.stopPropagation()}
            className="z-[9992] w-64 rounded-lg border border-border bg-background shadow-2xl p-3 font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
          >
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-600 mb-2">
              Compare {workerName} with
            </p>
            {loadingOptions ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="space-y-0.5 max-h-56 overflow-y-auto">
                {(options ?? []).map((opt) => {
                  const isSelf = opt.workerId === workerId;
                  return (
                    <label
                      key={opt.workerId}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                        isSelf
                          ? "text-zinc-400 dark:text-zinc-600 cursor-default"
                          : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 cursor-pointer"
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
                {options?.length === 0 && (
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
