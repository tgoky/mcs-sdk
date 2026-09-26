"use client";

import {
  Plug,
  Rocket,
  FileCheck,
  GitCompareArrows,
  BarChart3,
  LayoutGrid,
  HeartHandshake,
  TrendingDown,
  Ticket,
  ShieldAlert,
  Gavel,
  Megaphone,
  Waypoints,
  History,
  Users,
  CreditCard,
} from "lucide-react";
import type { WhopAgentSkillId } from "@/lib/whop-agent-skill-manifest";

/** Whop Agent's own per-playbook badge — same circular-badge shape as
 * RepSkillBadge/ColdOpenSkillBadge, its own palette per playbook. */
export const WHOP_AGENT_SKILL_SQUISHY_CONFIG: Record<WhopAgentSkillId, { bgClass: string; icon: React.ElementType }> = {
  "whop-connect": { bgClass: "bg-[#7dd3fc]", icon: Plug }, // sky — connection
  "whop-product-launch-preflight": { bgClass: "bg-[#fbbf24]", icon: Rocket }, // amber — launch
  "whop-purchase-cap-copilot": { bgClass: "bg-[#fdba74]", icon: FileCheck }, // orange — application packet
  "whop-drift-monitor": { bgClass: "bg-[#e5e7eb]", icon: GitCompareArrows }, // neutral — structural diff
  "whop-weekly-ops-report": { bgClass: "bg-[#93c5fd]", icon: BarChart3 }, // blue — reporting
  "whop-portfolio-rollup": { bgClass: "bg-[#a5b4fc]", icon: LayoutGrid }, // indigo — cross-account
  "whop-cancellation-save-offer": { bgClass: "bg-[#5eead4]", icon: HeartHandshake }, // teal — retention
  "whop-payment-recovery": { bgClass: "bg-[#86efac]", icon: CreditCard }, // green — money back
  "whop-refund-dispute-velocity": { bgClass: "bg-[#fca5a5]", icon: TrendingDown }, // red — velocity alert
  "whop-bulk-promo-codes": { bgClass: "bg-[#bef264]", icon: Ticket }, // lime — codes
  "whop-payout-hold-kit": { bgClass: "bg-[#fca5a5]", icon: ShieldAlert }, // red — hold/suspension
  "whop-dispute-response": { bgClass: "bg-[#f9a8d4]", icon: Gavel }, // pink — dispute
  "whop-ads-draft-approve": { bgClass: "bg-[#c4b5fd]", icon: Megaphone }, // violet — ads
  "whop-bridge-manager": { bgClass: "bg-[#67e8f9]", icon: Waypoints }, // cyan — routing
  "whop-daily-change-digest": { bgClass: "bg-[#e5e7eb]", icon: History }, // neutral — change log
  "whop-attribution-report": { bgClass: "bg-[#93c5fd]", icon: Users }, // blue — attribution
};

export function WhopAgentSkillBadge({ skill, size = 20 }: { skill: WhopAgentSkillId; size?: number }) {
  const config = WHOP_AGENT_SKILL_SQUISHY_CONFIG[skill];
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
