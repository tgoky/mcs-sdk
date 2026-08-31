"use client";

import { useCallback, useState, ReactNode } from "react";
import { TopNav } from "@/components/top-nav";
import { PrimaryRail } from "@/components/primary-rail";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { SettingsSidebar } from "@/app/dashboard/settings/settings-sidebar";
import { RightUtilityPanel, type RightPanelKey } from "@/components/right-utility-panel";
import { useNotifications } from "@/app/dashboard/use-notifications";
import type { Workspace } from "@/lib/workspace";

const PANEL_WIDTH_KEY = "mcs-right-panel-width";
const DEFAULT_PANEL_WIDTH = 360;

export function ShellLayout({
  children,
  displayName,
  userEmail,
  workspaces,
  activeWorkspaceId,
  work,
  engagements,
  meetings,
  settings,
  reports,
}: {
  children: ReactNode;
  displayName: string;
  userEmail: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  work: ReactNode;
  engagements: ReactNode;
  meetings: ReactNode;
  settings?: ReactNode;
  reports: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Right-utility-panel state (Calendar / Teammates / Notifications /
  // Autopilot / Upcoming / Plan) lives here since it has to affect both
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

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-zinc-600 dark:text-zinc-400 font-sans antialiased overflow-hidden transition-colors duration-200">
      {/* 1. Global Top Navigation Header */}
      <TopNav
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        displayName={displayName}
        activePanel={activePanel}
        onSelectPanel={handleSelectPanel}
        unreadNotifications={notifications.unreadCount}
      />

      {/* 2. Main Body 3-Region Split (+ the right utility panel, when open) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Primary Narrow Icon Rail */}
        <div className="hidden md:flex">
          <PrimaryRail
            displayName={displayName}
            userEmail={userEmail}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
          />
        </div>

        {/* Column 2: Secondary Collapsible Sidebar — its content swaps
            entirely based on which primary-rail section is active */}
        {sidebarOpen && (
          <div className="hidden md:flex">
            <SecondarySidebar
              work={work}
              engagements={engagements}
              meetings={meetings}
              settings={settings ?? <SettingsSidebar />}
              reports={reports}
            />
          </div>
        )}

        {/* Column 3: Main Page Area — shrinks (doesn't get covered) when
            the right utility panel opens, since that panel is a flex
            sibling here, not an absolutely-positioned overlay. */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 w-full bg-background [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
      </div>
    </div>
  );
}