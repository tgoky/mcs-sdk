"use client";

import { ReactNode } from "react";

interface SecondarySidebarProps {
  sidebarNav: ReactNode;
  sidebarSkills: ReactNode;
}

export function SecondarySidebar({ sidebarNav, sidebarSkills }: SecondarySidebarProps) {
  return (
    <aside className="w-60 bg-zinc-900/90 dark:bg-zinc-900/90 rounded-tl-2xl border-t border-l border-zinc-800/80 flex flex-col shrink-0 select-none py-4 px-3 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden shadow-2xl transition-all duration-200">
      <div className="px-2 pb-2 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 font-mono tracking-wider uppercase">
        Work
      </div>

      {/* Render Real Navigation */}
      {sidebarNav}

      <div className="my-4 border-t border-zinc-800/60" />

      {/* Render Real Skills & Modules List */}
      {sidebarSkills}
    </aside>
  );
}