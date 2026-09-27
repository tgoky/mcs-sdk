"use client";

import { ReactNode, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface SecondarySidebarProps {
  work: ReactNode;
  settings: ReactNode;
  /** Collapsed, it slides to nothing instead of vanishing. */
  open?: boolean;
  width?: number;
  onWidthChange?: (w: number) => void;
}

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 440;
export const SIDEBAR_DEFAULT_WIDTH = 240;

type SectionKey = "settings" | "work";

/**
 * Two slots, not the six this used to have (work/settings/reputationManager/
 * showtime/reportsReputationManager/reportsShowtime). Those extra four
 * existed to swap in an entirely different sidebar depending on which
 * product's "context" a route belonged to — the exact "different menu for
 * the same client" problem the whole worker-registry restructure set out
 * to remove, still standing here untouched through every phase of it.
 * WorkSidebar already covers every worker across both products via its own
 * Capabilities grid, so once nothing routes into a product-specific
 * variant anymore, there's nothing left for those four slots to hold.
 */
function activeSection(pathname: string): SectionKey {
  return pathname.startsWith("/dashboard/settings") ? "settings" : "work";
}

const SECTION_LABELS: Record<SectionKey, string> = {
  work: "Work",
  settings: "Settings",
};

export function SecondarySidebar({ work, settings, open = true, width = SIDEBAR_DEFAULT_WIDTH, onWidthChange }: SecondarySidebarProps) {
  const pathname = usePathname();
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);

  // Drag the right edge to widen or narrow it; the width is kept by the shell.
  function onDragStart(e: React.MouseEvent) {
    if (!onWidthChange) return;
    e.preventDefault();
    drag.current = { x: e.clientX, w: width };
    setDragging(true);
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      onWidthChange(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, drag.current.w + ev.clientX - drag.current.x)));
    };
    const up = () => {
      drag.current = null;
      setDragging(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  // Library is intentionally a single-page marketplace. Teammates is
  // intentionally a self-contained two-pane layout of its own (thread
  // rail + chat, see teammates-workspace.tsx). Analytics is one
  // self-contained overview page with nothing to navigate between within
  // it (its own AnalyticsSidebar went unused for exactly that reason —
  // see that file's header). Apps got its own rail entry (primary-nav.ts)
  // and already renders its own Browse/Categories filter aside inline
  // (apps-page-client.tsx) — showing the generic Settings nested list
  // (Account/Billing/etc.) here too would just stack two sidebars doing
  // the same job. The generic Work sidebar (Home/Reports/Queue/
  // Executions/Capabilities) was showing up to the left of all four for
  // no reason, wasting width and duplicating a "list of things" role
  // each page either doesn't need or already has its own version of.
  // Hiding this column for all four lets their own content use the full
  // width instead. Every other /dashboard/settings/* page (Account,
  // Billing, Timezones, etc.) is unaffected and still gets this nested
  // list as its way to navigate between them.
  if (
    pathname === "/dashboard/library" ||
    pathname.startsWith("/dashboard/library/") ||
    pathname === "/dashboard/teammates" ||
    pathname.startsWith("/dashboard/teammates/") ||
    pathname === "/dashboard/analytics" ||
    pathname.startsWith("/dashboard/analytics/") ||
    pathname === "/dashboard/settings/apps"
  ) {
    return null;
  }

  const section = activeSection(pathname);
  const content: Record<SectionKey, ReactNode> = { work, settings };

  return (
    <aside
      aria-hidden={!open}
      style={{ width: open ? width : 0 }}
      className={`relative shrink-0 overflow-hidden bg-[#f8f7fa] dark:bg-sidebar select-none font-sans antialiased text-zinc-700 dark:text-zinc-300 ${
        open ? "border-r border-zinc-200/80 dark:border-sidebar-border" : ""
      } ${dragging ? "" : "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out"}`}
    >
      {/* Fixed at the full width inside, so collapsing slides the column
          closed instead of squeezing its text on the way. */}
      <div
        style={{ width }}
        className={`flex h-full flex-col overflow-y-auto py-3 px-2 motion-safe:transition-opacity motion-safe:duration-150 ${open ? "opacity-100" : "opacity-0"}`}
        inert={!open}
      >
        <div className="px-3 pt-1 pb-2 text-[14px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {SECTION_LABELS[section]}
        </div>
        <div className="flex-1">{content[section]}</div>
      </div>
      {open && onWidthChange && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onMouseDown={onDragStart}
          onDoubleClick={() => onWidthChange(SIDEBAR_DEFAULT_WIDTH)}
          title="Drag to resize · double-click to reset"
          className={`absolute right-0 top-0 bottom-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-zinc-400/40 dark:hover:bg-zinc-600/40 ${dragging ? "bg-zinc-400/50 dark:bg-zinc-600/50" : ""}`}
        />
      )}
    </aside>
  );
}
