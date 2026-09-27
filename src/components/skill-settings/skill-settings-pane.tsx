"use client";

// src/components/skill-settings/skill-settings-pane.tsx
//
// A skill's settings beside what's being looked at, opening by width so
// it narrows the rest instead of covering it, with a drag-to-resize edge,
// a pinned Save, and its own scroll (the rest keeps its own).
//   shell   the app's right edge, full height, like Teammates: opened by
//           the sidebar's gears, from any page.
//   inline  inside a page, beside its skill list, like run history's
//           details: opened by the list's own gears.
// Desktop only; on phones a gear opens the settings page instead.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, X } from "lucide-react";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { useToast } from "@/components/toast/toast-provider";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { SkillSettingsPanel } from "./skill-settings-panel";
import { hereForBack, skillSettingsHref, useSkillPane } from "./skill-pane-context";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 380;
const MAX_WIDTH = 760;

export function SkillSettingsPane({ width, onWidthChange, variant = "shell" }: { width: number; onWidthChange: (w: number) => void; variant?: "shell" | "inline" }) {
  const pane = useSkillPane();
  const router = useRouter();
  const toast = useToast();
  const dragging = useRef(false);
  const asideRef = useRef<HTMLElement>(null);
  const current = pane?.current ?? null;
  // Kept while the column closes, so it doesn't empty mid-animation.
  const [shown, setShown] = useState(current);
  if (current && current !== shown) setShown(current);
  useEffect(() => {
    if (current) return;
    const t = setTimeout(() => setShown(null), 150);
    return () => clearTimeout(t);
  }, [current]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      // The pane's right edge: the window's for the shell, the page's for inline.
      const right = variant === "inline" ? (asideRef.current?.getBoundingClientRect().right ?? window.innerWidth) : window.innerWidth;
      onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, right - e.clientX)));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onWidthChange, variant]);

  // Escape closes it, unless a card opened from inside has the focus.
  useEffect(() => {
    if (!current) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (e.target instanceof Element && e.target.closest("[data-floating-layer]")) return;
      pane?.close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, pane]);

  if (!pane) return null;
  const open = Boolean(current);
  const worker = shown ? WORKER_REGISTRY[shown.skillId as WorkerId] : null;

  return (
    <aside
      ref={asideRef}
      className={
        variant === "shell"
          ? "hidden md:flex relative shrink-0 flex-col border-l h-full transition-[width,opacity] duration-150 ease-out overflow-hidden bg-background border-zinc-200/80 dark:border-zinc-800/80"
          : // Stays in view while the page scrolls the list beside it.
            cn(
              "hidden md:flex sticky top-0 shrink-0 flex-col self-start transition-[width,opacity,margin] duration-150 ease-out overflow-hidden rounded-lg bg-white dark:bg-zinc-900/40",
              // Closed, it takes no height either, or the row beside it
              // would stretch to a screen's height and push what follows down.
              open ? "h-[calc(100vh-7.5rem)] ml-4 border border-zinc-200 dark:border-zinc-800/80" : "h-0"
            )
      }
      style={{ width: open ? width : 0, opacity: open ? 1 : 0 }}
      aria-hidden={!open}
      aria-label={worker ? `${worker.name} settings` : undefined}
    >
      {shown && worker && (
        <>
          <div onMouseDown={onDragStart} className="absolute left-0 top-0 bottom-0 z-20 -ml-0.5 w-1.5 cursor-col-resize transition-colors hover:bg-zinc-400/40 dark:hover:bg-zinc-600/40" title="Drag to resize" />
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-200/80 px-3 dark:border-zinc-800/80">
            <AnySkillBadge skill={shown.skillId as WorkerId} size={18} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{worker.name}</span>
            <button
              type="button"
              onClick={() => {
                router.push(skillSettingsHref(shown.engagementId, shown.skillId, hereForBack()));
                pane.close();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
              title="Open as a page"
              aria-label="Open as a page"
            >
              <Maximize2 size={14} />
            </button>
            <button
              type="button"
              onClick={pane.close}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
              title="Close"
              aria-label="Close settings"
            >
              <X size={14} />
            </button>
          </div>

          {pane.pending && (
            <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-300/60 bg-amber-50/80 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-200">
              <span className="min-w-0 flex-1">
                {worker.name} has unsaved changes. Open {WORKER_REGISTRY[pane.pending.skillId as WorkerId]?.name ?? "the other skill"} anyway?
              </span>
              <button type="button" onClick={pane.keepEditing} className="h-7 rounded-md px-2 font-medium hover:bg-amber-100 dark:hover:bg-amber-300/10 cursor-pointer">
                Keep editing
              </button>
              <button type="button" onClick={pane.discard} className="h-7 rounded-md border border-amber-400/70 px-2 font-medium hover:bg-amber-100 dark:border-amber-300/30 dark:hover:bg-amber-300/10 cursor-pointer">
                Discard
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1">
            <SkillSettingsPanel
              key={`${shown.engagementId}:${shown.skillId}`}
              engagementId={shown.engagementId}
              skillId={shown.skillId}
              layout="fill"
              only={shown.only}
              onDirtyChange={pane.setDirty}
              onClose={pane.close}
              onSaved={(notice) => {
                toast.success(notice ? `${worker.name} saved. ${notice}` : `${worker.name} saved.`);
                router.refresh();
              }}
            />
          </div>
        </>
      )}
    </aside>
  );
}
