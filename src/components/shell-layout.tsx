"use client";

import { useState, ReactNode } from "react";
import { TopNav } from "@/components/top-nav";
import { PrimaryRail } from "@/components/primary-rail";
import { SecondarySidebar } from "@/components/secondary-sidebar";

export function ShellLayout({
  children,
  displayName,
  userEmail,
  work,
  engagements,
  analytics,
  meetings,
}: {
  children: ReactNode;
  displayName: string;
  userEmail: string;
  work: ReactNode;
  engagements: ReactNode;
  analytics: ReactNode;
  meetings: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen w-screen flex flex-col bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 font-sans antialiased overflow-hidden transition-colors duration-200">
      {/* 1. Global Top Navigation Header */}
      <TopNav 
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)} 
        displayName={displayName} 
      />

      {/* 2. Main Body 3-Region Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Primary Narrow Icon Rail */}
        <div className="hidden md:flex">
          <PrimaryRail displayName={displayName} userEmail={userEmail} />
        </div>

        {/* Column 2: Secondary Collapsible Sidebar — its content swaps
            entirely based on which primary-rail section is active */}
        {sidebarOpen && (
          <div className="hidden md:flex">
            <SecondarySidebar
              work={work}
              engagements={engagements}
              analytics={analytics}
              meetings={meetings}
            />
          </div>
        )}

        {/* Column 3: Main Page Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 w-full bg-white dark:bg-zinc-950 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </main>
      </div>
    </div>
  );
}