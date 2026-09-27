"use client";

// src/components/product-setup/skill-switch.tsx
//
// One Showtime skill with its own badge and an on/off switch. The setup
// screen lists every skill this way so a client can run just the Funnel
// Audit, or everything; what the screen asks for follows what's on.

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { Settings } from "lucide-react";
import { settingsBeyondSetup } from "@/lib/skill-settings/schema";
import { useSkillPane } from "@/components/skill-settings/skill-pane-context";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { anySkillDisplayName } from "@/lib/any-skill";
import { cn } from "@/lib/utils";

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50",
        on ? "bg-[var(--ink)]" : "bg-[var(--accent-dim)] ring-1 ring-inset ring-[var(--border)]"
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 700, damping: 35 }}
        className={cn("h-5 w-5 rounded-full shadow-elevation-1", on ? "ml-auto bg-[var(--ink-foreground)]" : "bg-background")}
      />
    </button>
  );
}

export function SkillSwitchRow({
  skillId,
  blurb,
  on,
  onChange,
  children,
}: {
  skillId: string;
  blurb: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** What the skill will do, shown while it's on (the review's sentence). */
  children?: ReactNode;
}) {
  const name = anySkillDisplayName(skillId);
  // The skill's settings this setup doesn't ask, beside its switch: opened
  // at the right edge like the sidebar's gears. Only on a client's page.
  const params = useParams<{ id?: string }>();
  const pane = useSkillPane();
  const engagementId = typeof params?.id === "string" ? params.id : null;
  const productId = skillId in WORKER_REGISTRY ? WORKER_REGISTRY[skillId as WorkerId].productId : null;
  const only = productId ? settingsBeyondSetup(skillId, productId) : [];
  const gearOpen = pane?.current?.skillId === skillId;
  const gear =
    on && engagementId && pane && only.length > 0 ? (
      <button
        type="button"
        onClick={() => (gearOpen ? pane.close() : pane.open({ engagementId, skillId, only }))}
        aria-pressed={gearOpen}
        aria-label={`${name} settings`}
        title="More settings"
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer",
          gearOpen ? "bg-[var(--accent-dim)] text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--accent-dim)] hover:text-[var(--text-primary)]"
        )}
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    ) : null;
  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 transition-opacity", !on && "opacity-50 grayscale")}>
          <AnySkillBadge skill={skillId} size={28} enabled={on} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", on ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>{name}</p>
          {on && children ? (
            <div className="mt-1 text-[15px] leading-[1.9] text-[var(--text-secondary)]">{children}</div>
          ) : (
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{blurb}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {gear}
          <Switch on={on} onChange={onChange} label={`${name} ${on ? "on" : "off"}`} />
        </div>
      </div>
    </li>
  );
}
