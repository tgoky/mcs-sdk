"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, ReactNode } from "react";
import { TopNav } from "@/components/top-nav";
import { PrimaryRail } from "@/components/primary-rail";
import { SecondarySidebar, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "@/components/secondary-sidebar";
import { SettingsSidebar } from "@/app/dashboard/settings/settings-sidebar";
import { RightUtilityPanel, type RightPanelKey } from "@/components/right-utility-panel";
import { useNotifications } from "@/app/dashboard/use-notifications";
import type { Workspace } from "@/lib/workspace";
import type { UserAvatarPrefs } from "@/lib/user-avatar";
import { SkillPaneProvider, useSkillPane } from "@/components/skill-settings/skill-pane-context";
import { SkillSettingsPane } from "@/components/skill-settings/skill-settings-pane";
import type { CreateMenuContext } from "@/components/top-nav";
import { InstalledSkillsProvider } from "@/components/installed-skills-context";

const PANEL_WIDTH_KEY = "mcs-right-panel-width";
const SIDEBAR_WIDTH_KEY = "mcs-sidebar-width";
const SIDEBAR_WIDTH_EVENT = "mcs-sidebar-width";
// Used when storage is blocked, so dragging still works for this visit.
let sidebarWidthFallback = SIDEBAR_DEFAULT_WIDTH;
function readSidebarWidth(): number {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= SIDEBAR_MIN_WIDTH && n <= SIDEBAR_MAX_WIDTH ? n : sidebarWidthFallback;
  } catch {
    return sidebarWidthFallback;
  }
}
function subscribeSidebarWidth(onChange: () => void) {
  window.addEventListener(SIDEBAR_WIDTH_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SIDEBAR_WIDTH_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
const DEFAULT_PANEL_WIDTH = 360;
const SETTINGS_PANE_WIDTH_KEY = "mcs-settings-pane-width";
const DEFAULT_SETTINGS_PANE_WIDTH = 460;

/** The utility panel and the Configure pane share the right edge: opening one closes the other. */
function PaneExclusion({ activePanel, closePanel }: { activePanel: RightPanelKey | null; closePanel: () => void }) {
  const pane = useSkillPane();
  const paneOpen = Boolean(pane?.current);
  useEffect(() => {
    if (activePanel && paneOpen) pane?.close();
    // Only when the utility panel is opened, not when the pane is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel]);
  useEffect(() => {
    if (paneOpen) closePanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneOpen]);
  return null;
}

export function ShellLayout({
  children,
  displayName,
  userEmail,
  workspaces,
  activeWorkspaceId,
  avatar,
  work,
  settings,
  createMenu,
}: {
  children: ReactNode;
  displayName: string;
  userEmail: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  avatar: UserAvatarPrefs;
  work: ReactNode;
  settings?: ReactNode;
  /** What the Create menu's shortcuts act on (the active client). */
  createMenu?: CreateMenuContext;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Read after hydration (the server renders the default), so the page
  // the server sent and the first browser render agree.
  const sidebarWidth = useSyncExternalStore(subscribeSidebarWidth, readSidebarWidth, () => SIDEBAR_DEFAULT_WIDTH);
  const handleSidebarWidth = useCallback((w: number) => {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
    } catch {
      // Width just isn't remembered past this visit.
    }
    sidebarWidthFallback = w;
    window.dispatchEvent(new Event(SIDEBAR_WIDTH_EVENT));
  }, []);

  // Right-utility-panel state (Calendar / Teammates / Notifications /
  // Upcoming / Plan) lives here since it has to affect both
  // TopNav (which icon looks active) and the main column (which shrinks
  // to make room) — those are siblings, not parent/child, so this is the
  // lowest common ancestor.
  const [activePanel, setActivePanel] = useState<RightPanelKey | null>(null);
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
    const stored = window.localStorage.getItem(PANEL_WIDTH_KEY);
    const n = stored ? Number(stored) : NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_PANEL_WIDTH;
  });

  const handleWidthChange = useCallback((w: number) => {
    setPanelWidth(w);
    window.localStorage.setItem(PANEL_WIDTH_KEY, String(w));
  }, []);

  const handleSelectPanel = useCallback((key: RightPanelKey) => {
    // Clicking the already-open icon is the only way the panel closes —
    // no click-outside dismiss, no timeout fade, per this round's spec.
    setActivePanel((prev) => (prev === key ? null : key));
  }, []);

  const notifications = useNotifications();
  const [paneWidth, setPaneWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS_PANE_WIDTH;
    try {
      const n = Number(window.localStorage.getItem(SETTINGS_PANE_WIDTH_KEY));
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_SETTINGS_PANE_WIDTH;
    } catch {
      return DEFAULT_SETTINGS_PANE_WIDTH;
    }
  });
  const handlePaneWidth = useCallback((w: number) => {
    setPaneWidth(w);
    try {
      window.localStorage.setItem(SETTINGS_PANE_WIDTH_KEY, String(w));
    } catch {
      // Width just isn't remembered.
    }
  }, []);

  return (
    <InstalledSkillsProvider value={createMenu}>
    <SkillPaneProvider>
    <PaneExclusion activePanel={activePanel} closePanel={() => setActivePanel(null)} />
    <div className="h-screen w-screen flex flex-col bg-background text-zinc-600 dark:text-zinc-400 font-sans antialiased overflow-hidden transition-colors duration-200">
      {/* 1. Global Top Navigation Header */}
      <TopNav
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        sidebarOpen={sidebarOpen}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        displayName={displayName}
        activePanel={activePanel}
        onSelectPanel={handleSelectPanel}
        unreadNotifications={notifications.unreadCount}
        createMenu={createMenu}
      />

      {/* 2. Main Body 3-Region Split (+ the right utility panel, when open) */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Column 1: Primary Narrow Icon Rail */}
        <div className="hidden md:flex">
          <PrimaryRail
            displayName={displayName}
            userEmail={userEmail}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            avatar={avatar}
          />
        </div>

        {/* Column 2: Secondary Collapsible Sidebar — its content swaps
            entirely based on which primary-rail section is active */}
        <div className="hidden md:flex">
          <SecondarySidebar
            work={work}
            settings={settings ?? <SettingsSidebar />}
            open={sidebarOpen}
            width={sidebarWidth}
            onWidthChange={handleSidebarWidth}
          />
        </div>

        {/* Column 3: Main Page Area — shrinks (doesn't get covered) when
            the right utility panel opens, since that panel is a flex
            sibling here, not an absolutely-positioned overlay. */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-4 pt-5 pb-28 sm:px-6 sm:pt-6 md:p-8 w-full bg-background [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </main>

        {/* Column 4: the utility panel itself */}
        <RightUtilityPanel
          activePanel={activePanel}
          onClose={() => setActivePanel(null)}
          width={panelWidth}
          onWidthChange={handleWidthChange}
          notifications={notifications}
        />

        {/* Column 5: a skill's Configure, beside the page like a row's details. */}
        <SkillSettingsPane width={paneWidth} onWidthChange={handlePaneWidth} />
      </div>
    </div>
    </SkillPaneProvider>
    </InstalledSkillsProvider>
  );
}
