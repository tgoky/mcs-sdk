"use client";

import { Lock, Mic, Database, Send, Rocket, Inbox, BarChart3 } from "lucide-react";
import type { ColdOpenSkillId } from "@/lib/cold-open-skill-manifest";

/**
 * Cold Open's own per-skill badge — same shape as RepSkillBadge
 * (components/rep-skill-badge.tsx): a distinct hue + icon per capability,
 * its own palette rather than a repeat of Showtime's or Reputation
 * Manager's.
 */
export const COLD_OPEN_SKILL_SQUISHY_CONFIG: Record<ColdOpenSkillId, { bgClass: string; icon: React.ElementType }> = {
  "icp-lock": { bgClass: "bg-[#fda4af]", icon: Lock }, // rose — locks the config spine
  "voice-capture": { bgClass: "bg-[#c4b5fd]", icon: Mic }, // violet — brand voice
  "source-connect": { bgClass: "bg-[#93c5fd]", icon: Database }, // sky — lead source
  "send-connect": { bgClass: "bg-[#5eead4]", icon: Send }, // teal — sending platform
  "daily-send": { bgClass: "bg-[#fbbf24]", icon: Rocket }, // amber — the operational engine
  "reply-sort": { bgClass: "bg-[#bef264]", icon: Inbox }, // lime — reply triage
  "send-report": { bgClass: "bg-[#e5e7eb]", icon: BarChart3 }, // neutral gray — reporting
};

export function ColdOpenSkillBadge({ skill, size = 20 }: { skill: ColdOpenSkillId; size?: number }) {
  const config = COLD_OPEN_SKILL_SQUISHY_CONFIG[skill];
  const Icon = config.icon;
  const iconSize = Math.round(size * 0.6);

  return (
    <div className={`flex items-center justify-center rounded-full shrink-0 shadow-xs ${config.bgClass}`} style={{ width: size, height: size }}>
      <Icon size={iconSize} className="text-zinc-950 stroke-[2.3px]" strokeLinecap="round" strokeLinejoin="round" />
    </div>
  );
}
