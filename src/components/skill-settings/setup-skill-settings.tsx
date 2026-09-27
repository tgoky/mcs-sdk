"use client";

// src/components/skill-settings/setup-skill-settings.tsx
//
// The rest of a product's settings on its setup page: one block per
// switched-on skill, closed until opened, holding that skill's settings
// the setup above doesn't already ask (lib/skill-settings SETUP_COVERS),
// each saved on its own. With these, setup is everything configurable in
// one place; Configure stays the quick way to change one skill later.

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { useToast } from "@/components/toast/toast-provider";
import type { WorkerId } from "@/lib/worker-registry";
import { SkillSettingsPanel } from "./skill-settings-panel";

export interface SetupSkillBlock {
  skillId: WorkerId;
  name: string;
  /** The settings shown here (paths). */
  only: string[];
}

export function SetupSkillSettings({ engagementId, blocks }: { engagementId: string; blocks: SetupSkillBlock[] }) {
  const toast = useToast();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  if (blocks.length === 0) return null;
  const toggle = (id: string) => setOpen((o) => (o.has(id) ? new Set([...o].filter((x) => x !== id)) : new Set(o).add(id)));

  return (
    <section className="mx-auto w-full max-w-2xl space-y-3 pb-10 font-sans" aria-labelledby="setup-skill-settings">
      <div className="px-1">
        <h2 id="setup-skill-settings" className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Skill settings
        </h2>
        <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">What each skill does beyond the setup above. Each saves on its own.</p>
      </div>
      <ul className="divide-y divide-zinc-200/80 rounded-xl border border-zinc-200/80 bg-white/70 dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/40">
        {blocks.map((b) => {
          const isOpen = open.has(b.skillId);
          return (
            <li key={b.skillId}>
              <button
                type="button"
                onClick={() => toggle(b.skillId)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30 cursor-pointer"
              >
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                <AnySkillBadge skill={b.skillId} size={20} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{b.name}</span>
                {dirty.has(b.skillId) && <span className="text-[11.5px] text-amber-700 dark:text-amber-300">Unsaved</span>}
              </button>
              {/* Kept mounted once opened, so closing a block doesn't drop what was typed. */}
              <div hidden={!isOpen} className="px-4 pb-4">
                {(isOpen || dirty.has(b.skillId)) && (
                  <SkillSettingsPanel
                    engagementId={engagementId}
                    skillId={b.skillId}
                    layout="section"
                    only={b.only}
                    onDirtyChange={(d) =>
                      setDirty((cur) => {
                        if (d === cur.has(b.skillId)) return cur;
                        const next = new Set(cur);
                        if (d) next.add(b.skillId);
                        else next.delete(b.skillId);
                        return next;
                      })
                    }
                    onSaved={(notice) => toast.success(notice ? `${b.name} saved. ${notice}` : `${b.name} saved.`)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
