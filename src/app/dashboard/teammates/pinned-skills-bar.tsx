"use client";

// src/app/dashboard/teammates/pinned-skills-bar.tsx
//
// Screenshot 3's "Agents" panel — a '+' to pick skills, pinned ones shown
// as quick-access chips so someone doesn't have to type @ every time.
// We call them skills, not agents, per the original instruction, but the
// interaction (pin so it's always one click away) is the same idea.

import { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { usePinnedSkills } from "./pinned-skills";
import { MENTIONABLE_SKILLS } from "./teammates-chat";

export function PinnedSkillsBar({ onSelect }: { onSelect: (token: string) => void }) {
  const { pinned, isPinned, toggle } = usePinnedSkills();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="relative flex items-center gap-1.5 px-3 py-2 border-b flex-wrap" style={{ borderColor: "var(--border)" }}>
      {pinned.length === 0 ? (
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          No skills pinned yet
        </span>
      ) : (
        MENTIONABLE_SKILLS.filter((s) => isPinned(s.token)).map((s) => (
          <button
            key={s.token}
            type="button"
            onClick={() => onSelect(s.token)}
            className="px-2 py-1 rounded-full text-[10px] font-bold transition-colors cursor-pointer"
            style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
          >
            {s.label}
          </button>
        ))
      )}

      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        className="flex items-center justify-center w-5 h-5 rounded-full ml-auto shrink-0 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
        aria-label="Add skills"
        title="Pin skills for quick access"
      >
        <Plus size={13} />
      </button>

      {pickerOpen && (
        <div
          className="absolute top-full right-2 mt-1 rounded-lg shadow-lg overflow-hidden z-10 w-44"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Pin skills
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
              aria-label="Close"
            >
              <X size={12} />
            </button>
          </div>
          {MENTIONABLE_SKILLS.map((s) => {
            const active = isPinned(s.token);
            return (
              <button
                key={s.token}
                type="button"
                onClick={() => toggle(s.token)}
                className="flex items-center justify-between w-full text-left px-2.5 py-1.5 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                style={{ color: "var(--text-primary)" }}
              >
                {s.label}
                {active && <Check size={12} style={{ color: "var(--text-prefill-accent)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
