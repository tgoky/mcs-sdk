"use client";

import { useState, ReactNode } from "react";
import { TopNav } from "@/components/top-nav";
import { PrimaryRail } from "@/components/primary-rail";
import { SecondarySidebar } from "@/components/secondary-sidebar";

export function ShellLayout({
  children,
  displayName,
  userEmail,
  sidebarNav,
  sidebarSkills,
}: {
  children: ReactNode;
  displayName: string;
  userEmail: string;
  sidebarNav: ReactNode;
  sidebarSkills: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 dark:bg-black text-zinc-300 font-sans antialiased overflow-hidden transition-colors duration-200">
      {/* 1. Global Top Navigation Header (Outer Frame) */}
      <TopNav 
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)} 
        displayName={displayName} 
      />

      {/* 2. Main Body 3-Region Split */}
      <div className="flex-1 flex overflow-hidden bg-zinc-950 dark:bg-black">
        {/* Column 1: Primary Narrow Icon Rail */}
        <div className="hidden md:flex shrink-0">
          <PrimaryRail displayName={displayName} userEmail={userEmail} />
        </div>

        {/* Column 2: Secondary Sidebar (Nested Rounded Panel) */}
        {sidebarOpen && (
          <div className="hidden md:flex shrink-0 pt-1">
            <SecondarySidebar sidebarNav={sidebarNav} sidebarSkills={sidebarSkills} />
          </div>
        )}

        {/* Column 3: Main Viewport Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 w-full bg-zinc-950 dark:bg-black [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </main>
      </div>
    </div>
  );
}