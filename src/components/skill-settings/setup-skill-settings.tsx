"use client";

// src/components/skill-settings/setup-skill-settings.tsx
//
// For a setup that doesn't list its skills with switches (Cold Open's), the
// switched-on skills with settings the setup doesn't ask, each with a gear
// that opens those settings at the right edge, the way a setup's own skill
// rows do (skill-switch.tsx). Setups with a switch list put the gear there.

import { Settings } from "lucide-react";
import { AnySkillBadge } from "@/components/any-skill-badge";
import type { WorkerId } from "@/lib/worker-registry";
import { useSkillPane } from "./skill-pane-context";
import { useOpenSkillSettings } from "@/app/dashboard/engagements/[id]/skill-configure-menu";

export interface SetupSkillBlock {
  skillId: WorkerId;
  name: string;
  /** The settings shown (paths): what the setup above doesn't ask. */
  only: string[];
}

export function SetupSkillSettings({ engagementId, blocks }: { engagementId: string; blocks: SetupSkillBlock[] }) {
  const pane = useSkillPane();
  const openPage = useOpenSkillSettings();
  if (blocks.length === 0) return null;
  return (
    <section className="mx-auto w-full max-w-2xl space-y-2 pb-10 font-sans" aria-labelledby="setup-skills">
      <h2 id="setup-skills" className="px-1 text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Skills
      </h2>
      <ul className="divide-y divide-zinc-200/80 rounded-xl border border-zinc-200/80 bg-white/70 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
        {blocks.map((b) => {
          const open = pane?.current?.skillId === b.skillId;
          return (
            <li key={b.skillId} className="flex items-center gap-2.5 px-4 py-2.5">
              <AnySkillBadge skill={b.skillId} size={20} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{b.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (open) pane?.close();
                  else if (pane && window.matchMedia("(min-width: 768px)").matches) pane.open({ engagementId, skillId: b.skillId, only: b.only });
                  else openPage(engagementId, b.skillId);
                }}
                aria-pressed={open}
                aria-label={`${b.name} settings`}
                title="More settings"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
                  open ? "bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
