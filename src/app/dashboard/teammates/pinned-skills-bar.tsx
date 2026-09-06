"use client";

import { usePinnedSkills } from "./pinned-skills";
import { MENTIONABLE_SKILLS } from "./teammates-chat";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Plus } from "lucide-react";

export function PinnedSkillsBar({ onSelect }: { onSelect: (token: string) => void }) {
  const { pinned, isPinned, toggle } = usePinnedSkills();

  const dropdownItems: DropdownItem[] = MENTIONABLE_SKILLS.map((s) => ({
    key: s.token,
    label: `${isPinned(s.token) ? "✓ " : ""}${s.label}`,
  }));

  return (
    <div className="flex items-center justify-between gap-1.5 px-3 py-1.5 border-b border-zinc-800 bg-black">
      <div className="flex items-center gap-1.5 flex-wrap">
        {pinned.length === 0 ? (
          <span className="text-[10px] text-zinc-500">
            No skills pinned
          </span>
        ) : (
          MENTIONABLE_SKILLS.filter((s) => isPinned(s.token)).map((s) => (
            <button
              key={s.token}
              type="button"
              onClick={() => onSelect(s.token)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer ${s.pillStyle}`}
            >
              <AnySkillBadge skill={s.token} size={12} />
              <span>{s.label}</span>
            </button>
          ))
        )}
      </div>

      <Dropdown
        variant="icon"
        icon={Plus}
        triggerTitle="Pin skills"
        align="right"
        items={dropdownItems}
        onSelect={(key) => toggle(key)}
      />
    </div>
  );
}