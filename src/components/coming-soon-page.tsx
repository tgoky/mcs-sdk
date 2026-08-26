// src/components/coming-soon-page.tsx
//
// Shared full-page shell for the 4 right-utility-rail destinations that
// aren't wired to real data yet (Calendar, Teammates, Autopilot, Upcoming,
// Plan — "Expand" in right-utility-panel.tsx routes here). Real content is
// separate follow-up work per panel; this just gives each one a real,
// navigable page today instead of a dead link.

import type { LucideIcon } from "lucide-react";

export function ComingSoonPage({
  icon: Icon,
  title,
  description,
  bullets,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <div className="relative min-h-screen w-full px-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" aria-hidden="true" />
      <div className="relative z-10 max-w-2xl mx-auto pt-16 flex flex-col items-center text-center gap-4">
        <span
          className="flex items-center justify-center w-12 h-12 rounded-full"
          style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
        >
          <Icon size={22} />
        </span>
        <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
        <p className="text-xs leading-relaxed max-w-md" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
        <ul className="text-left w-full max-w-sm mt-2 space-y-1.5">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="text-[11px] rounded-lg px-3 py-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
