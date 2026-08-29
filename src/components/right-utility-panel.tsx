// src/components/right-utility-panel.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Maximize2, CalendarDays, Users, Bot, ListChecks, Workflow, type LucideIcon } from "lucide-react";
import { NotificationList } from "@/app/dashboard/notification-bell";
import type { NotificationRow } from "@/app/dashboard/use-notifications";
import { AutopilotPanelContent } from "@/app/dashboard/autopilot/autopilot-panel-content";
import { CalendarPanelContent } from "@/app/dashboard/calendar/calendar-panel-content";
import { UpcomingPanelContent } from "@/app/dashboard/upcoming/upcoming-panel-content";
import { TeammatesPanelContent } from "@/app/dashboard/teammates/teammates-panel-content";

export type RightPanelKey = "notifications" | "calendar" | "teammates" | "autopilot" | "upcoming" | "plan";

export const RIGHT_PANEL_META: Record<RightPanelKey, { label: string; icon: LucideIcon; expandHref: string }> = {
  notifications: { label: "Notifications", icon: X, expandHref: "/dashboard/inbox" },
  calendar: { label: "Calendar", icon: CalendarDays, expandHref: "/dashboard/calendar" },
  teammates: { label: "Teammates", icon: Users, expandHref: "/dashboard/teammates" },
  autopilot: { label: "Autopilot", icon: Bot, expandHref: "/dashboard/autopilot" },
  upcoming: { label: "Upcoming", icon: ListChecks, expandHref: "/dashboard/upcoming" },
  plan: { label: "Plan", icon: Workflow, expandHref: "/dashboard/plan" },
};

const MIN_WIDTH = 320;
const MAX_WIDTH = 720;

type StillComingKey = Exclude<RightPanelKey, "notifications" | "autopilot" | "calendar" | "upcoming" | "teammates">;

function ComingSoonPanel({ panelKey }: { panelKey: StillComingKey }) {
  const meta = RIGHT_PANEL_META[panelKey];
  const Icon = meta.icon;
  const copy: Record<StillComingKey, string> = {
    plan: "A workshop for planning a client's week: connectors and tools to enrich a client, generate the win-back video scripts and handle the other one-off asks that currently go outside the app.",
  };
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
      <span
        className="flex items-center justify-center w-10 h-10 rounded-full"
        style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
      >
        <Icon size={18} />
      </span>
      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
        {meta.label} is coming next
      </p>
      <p className="text-[11px] leading-relaxed max-w-[240px] text-zinc-500 dark:text-zinc-400">
        {copy[panelKey]}
      </p>
    </div>
  );
}

export function RightUtilityPanel({
  activePanel,
  onClose,
  width,
  onWidthChange,
  notifications,
}: {
  activePanel: RightPanelKey | null;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  notifications: {
    notifs: NotificationRow[];
    unreadCount: number;
    markAllRead: () => void;
    markRead: (id: string) => void;
  };
}) {
  const router = useRouter();
  const draggingRef = useRef(false);
  const isOpen = activePanel !== null;

  // This panel is a flex sibling of <main> in shell-layout.tsx, not an
  // overlay — opening/closing it already reflows the whole page, and it
  // already had a `transition-[width]` for the drag-resize handle below.
  // So the open/close motion is that same width transition, driven all
  // the way down to 0 instead of unmounting outright: <main> reflows in
  // step with it for free, rather than snapping the instant a `return
  // null` mounts/unmounts a sibling. (A transform-based slide-in would
  // animate the panel's own content but leave <main> jumping instantly —
  // wrong technique for a layout-affecting sibling, right one for an
  // overlay like the Sheet drawers already use.)
  //
  // Content still needs to hang around a beat past `activePanel` going
  // null, or the box would visibly go blank first and *then* shrink —
  // same reasoning as closeItemWithAnimation in queue-panel.tsx, just
  // holding onto "what to render" instead of "whether to render".
  const [displayedPanel, setDisplayedPanel] = useState<RightPanelKey | null>(activePanel);
  if (activePanel && activePanel !== displayedPanel) {
    setDisplayedPanel(activePanel);
  }
  useEffect(() => {
    if (activePanel) return;
    const timeout = setTimeout(() => setDisplayedPanel(null), 150);
    return () => clearTimeout(timeout);
  }, [activePanel]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      onWidthChange(next);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onWidthChange]);

  const meta = displayedPanel ? RIGHT_PANEL_META[displayedPanel] : null;

  return (
    <div
      className="hidden md:flex relative shrink-0 flex-col border-l h-full transition-[width,opacity] duration-150 ease-out overflow-hidden bg-white dark:bg-black border-zinc-200/80 dark:border-zinc-800/80"
      style={{ width: isOpen ? width : 0, opacity: isOpen ? 1 : 0 }}
      aria-hidden={!isOpen}
    >
      {meta && displayedPanel && (
        <>
          {/* --- HYPER-MICRO TIGHT DOT GRID --- */}
          <div 
            className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" 
            aria-hidden="true"
          />

          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize z-20 hover:bg-zinc-400/40 dark:hover:bg-zinc-600/40 transition-colors"
            title="Drag to resize"
          />

          {/* Header */}
          <div className="relative z-10 flex items-center justify-between px-3 h-11 border-b shrink-0 border-zinc-200/80 dark:border-zinc-800/80">
            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              {meta.label}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  router.push(meta.expandHref);
                  onClose();
                }}
                className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                title={`Expand ${meta.label}`}
                aria-label={`Expand ${meta.label}`}
              >
                <Maximize2 size={14} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close panel"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Content area — keyed on displayedPanel so switching straight
              from one open panel to another (Calendar -> Notifications,
              no close in between) plays a quick settle-in instead of the
              content just being replaced mid-frame. */}
          <div key={displayedPanel} className="relative z-10 flex-1 min-h-0 right-panel-content-enter">
            {displayedPanel === "notifications" ? (
              <NotificationList
                notifs={notifications.notifs}
                unreadCount={notifications.unreadCount}
                markAllRead={notifications.markAllRead}
                markRead={notifications.markRead}
              />
            ) : displayedPanel === "autopilot" ? (
              <AutopilotPanelContent />
            ) : displayedPanel === "calendar" ? (
              <CalendarPanelContent />
            ) : displayedPanel === "upcoming" ? (
              <UpcomingPanelContent />
            ) : displayedPanel === "teammates" ? (
              <TeammatesPanelContent />
            ) : (
              <ComingSoonPanel panelKey={displayedPanel} />
            )}
          </div>
        </>
      )}
    </div>
  );
}