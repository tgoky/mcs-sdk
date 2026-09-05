"use client";

import { Fingerprint, Radar, Star, MessageCircle, AtSign, ShieldAlert } from "lucide-react";
import type { RepSkillId } from "@/lib/rep-skill-manifest";

/**
 * Reputation Manager's own per-capability badge — same circular-badge
 * shape as Showtime's SquishySkillBadge (components/squishy-skill-badge.tsx)
 * but its own palette and icon-per-capability, not a repeat of that one's
 * five colors (RM's are a different product with different capabilities,
 * not five variations on Showtime's). Distinct hue per capability so the
 * Capabilities list reads as six different things, not one purple dot
 * repeated six times.
 */
export const REP_SKILL_SQUISHY_CONFIG: Record<RepSkillId, { bgClass: string; icon: React.ElementType }> = {
  "rep-onboarding": { bgClass: "bg-[#5eead4]", icon: Fingerprint }, // teal — identity setup
  "rep-engine-panel": { bgClass: "bg-[#93c5fd]", icon: Radar }, // sky — scanning AI engines
  "rep-trustpilot-watch": { bgClass: "bg-[#bef264]", icon: Star }, // lime — reviews
  "rep-reddit-watch": { bgClass: "bg-[#fdba74]", icon: MessageCircle }, // orange — mentions/threads
  "rep-twitter-watch": { bgClass: "bg-[#c4b5fd]", icon: AtSign }, // violet — X mentions
  "rep-crisis-response": { bgClass: "bg-[#fca5a5]", icon: ShieldAlert }, // red — crisis/incident
};

export function RepSkillBadge({ skill, size = 20 }: { skill: RepSkillId; size?: number }) {
  const config = REP_SKILL_SQUISHY_CONFIG[skill];
  const Icon = config.icon;
  const iconSize = Math.round(size * 0.6);

  return (
    <div
      className={`flex items-center justify-center rounded-full shrink-0 shadow-xs ${config.bgClass}`}
      style={{ width: size, height: size }}
    >
      <Icon size={iconSize} className="text-zinc-950 stroke-[2.3px]" strokeLinecap="round" strokeLinejoin="round" />
    </div>
  );
}
