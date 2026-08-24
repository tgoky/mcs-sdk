"use client";

import { useState, ReactNode } from "react";
import { TopNav } from "@/components/top-nav";
import { PrimaryRail } from "@/components/primary-rail";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { SettingsSidebar } from "@/app/dashboard/settings/settings-sidebar";
import type { Workspace } from "@/lib/workspace";

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
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-zinc-600 dark:text-zinc-400 font-sans antialiased overflow-hidden transition-colors duration-200">
      {/* 1. Global Top Navigation Header */}
      <TopNav 
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)} 
        displayName={displayName} 
      />

      {/* 2. Main Body 3-Region Split */}
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
            />
          </div>
        )}

        {/* Column 3: Main Page Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 w-full bg-background [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </main>
      </div>
    </div>
  );
}