"use client";

import Link from "next/link";
import { ArrowUpRight, Megaphone } from "lucide-react";
import { useSkillPane } from "@/components/skill-settings/skill-pane-context";

/**
 * The "Grow your reputation" entry on a client's page. On a wide screen it
 * opens in the right-hand pane beside the page, like Teammates; on a phone
 * (or with the link opened in a new tab) it goes to the page.
 */
export function GrowReputationCard({ engagementId }: { engagementId: string }) {
  const pane = useSkillPane();

  return (
    <Link
      href={`/dashboard/engagements/${engagementId}/offensive`}
      onClick={(e) => {
        const plain = !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0;
        if (!pane || !plain || !window.matchMedia("(min-width: 768px)").matches) return;
        e.preventDefault();
        pane.open({ engagementId, skillId: "grow-reputation", panel: "grow" });
      }}
      className="group flex items-center justify-between gap-3 no-ambient-glow surface-glass-2 rounded-2xl p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
          <Megaphone size={16} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            Grow your reputation
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Three guided steps to improve what Google and AI assistants say about this client: their website, the press, and Reddit.</p>
        </div>
      </div>
      <ArrowUpRight size={16} className="text-zinc-400 shrink-0" />
    </Link>
  );
}
