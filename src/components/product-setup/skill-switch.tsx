"use client";

// src/components/product-setup/skill-switch.tsx
//
// One Showtime skill with its own badge and an on/off switch. The setup
// screen lists every skill this way so a client can run just the Funnel
// Audit, or everything; what the screen asks for follows what's on.

import type { ReactNode } from "react";
import { motion } from "motion/react";
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
        <Switch on={on} onChange={onChange} label={`${name} ${on ? "on" : "off"}`} />
      </div>
    </li>
  );
}
