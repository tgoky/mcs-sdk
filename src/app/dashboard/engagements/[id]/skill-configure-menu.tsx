"use client";

// src/app/dashboard/engagements/[id]/skill-configure-menu.tsx
//
// A skill's Configure gear. On a computer it opens the skill's settings in
// the area at the right edge (skill-settings-pane.tsx), beside whatever
// page this is, the way Teammates opens from the top bar; another gear
// swaps what's shown there. On a phone there's no room beside the page,
// so it opens the skill's settings page instead. Skills with nothing to
// set don't get a gear.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { hasSkillSettings } from "@/lib/skill-settings/schema";
import { hereForBack, skillSettingsHref, useSkillPane } from "@/components/skill-settings/skill-pane-context";
import type { WorkerId } from "@/lib/worker-registry";
import { cn } from "@/lib/utils";

export type ConfigurableSkillId = WorkerId;

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

/** Opens a skill's settings: beside the page on a computer, as a page on a phone. */
export function useOpenSkillSettings() {
  const pane = useSkillPane();
  const router = useRouter();
  return (engagementId: string, skillId: string) => {
    if (pane && isDesktop()) pane.open({ engagementId, skillId });
    else router.push(skillSettingsHref(engagementId, skillId, hereForBack()));
  };
}

export function SkillConfigureMenu({
  skillId,
  engagementId,
  defaultOpen = false,
  triggerClassName,
  iconSize = 17,
}: {
  skillId: ConfigurableSkillId;
  engagementId: string;
  /** Open on arrival: the page was reached from a settings link (?configure=1). */
  defaultOpen?: boolean;
  /** The row's own icon-button look, where it has one. */
  triggerClassName?: string;
  iconSize?: number;
}) {
  const pane = useSkillPane();
  const openSettings = useOpenSkillSettings();
  const active = pane?.current?.skillId === skillId && pane.current.engagementId === engagementId;

  useEffect(() => {
    if (defaultOpen && hasSkillSettings(skillId)) openSettings(engagementId, skillId);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasSkillSettings(skillId)) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (active) pane?.close();
        else openSettings(engagementId, skillId);
      }}
      aria-pressed={active}
      aria-label="Configure"
      title="Configure"
      className={cn(
        triggerClassName ??
          "hover-lift press-settle flex items-center justify-center rounded-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 w-8 h-8 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0",
        active && "text-zinc-900 dark:text-white ring-1 ring-zinc-400/60 dark:ring-zinc-500/60"
      )}
    >
      <Settings size={iconSize} />
    </button>
  );
}
