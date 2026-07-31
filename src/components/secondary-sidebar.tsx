"use client";

import { ReactNode } from "react";

interface SecondarySidebarProps {
  sidebarNav: ReactNode;
  sidebarSkills: ReactNode;
}

export function SecondarySidebar({ sidebarNav, sidebarSkills }: SecondarySidebarProps) {
  return (
    <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 select-none py-4 px-3 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="px-2 pb-2 text-[11px] font-semibold text-zinc-500 font-mono tracking-wider uppercase">
        Work
      </div>

      {/* Passed from Server Component (layout.tsx) */}
      {sidebarNav}

      <div className="my-4 border-t border-sidebar-border" />

      {/* Passed from Server Component (layout.tsx) */}
      {sidebarSkills}
    </aside>
  );
}