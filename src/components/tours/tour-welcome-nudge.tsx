"use client";

// The proactive half of onboarding — first-time users don't reliably
// notice a small icon next to the breadcrumb trail, so this shows once,
// unprompted, on the dashboard home for a workspace that's never touched
// a tour. Dismissing it (without starting a tour) is remembered the same
// way real tour progress is — see tour-provider.tsx's dismissWelcome —
// so it never nags twice. The breadcrumb launcher (tour-launcher.tsx)
// stays there permanently either way, for anyone who skips this and
// wants it later.

import { Compass, X, Sparkles } from "lucide-react";
import { useTour } from "./tour-provider";

export function TourWelcomeNudge() {
  const { tours, hasSeenWelcome, start, dismissWelcome } = useTour();
  const fullWalkthrough = tours.find((t) => t.id === "full-walkthrough");

  if (hasSeenWelcome || !fullWalkthrough) return null;

  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 shrink-0">
        <Compass size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-amber-900 dark:text-amber-200">New here? Take the tour.</p>
        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/70 leading-snug mt-0.5">
          A quick, real walkthrough of the dashboard, the Library, and every worker — or pick just the piece you need
          from the compass icon next to the breadcrumbs, any time.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => start(fullWalkthrough.id)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          <Sparkles size={12} /> Start
        </button>
        <button
          type="button"
          onClick={dismissWelcome}
          aria-label="Dismiss"
          className="p-1.5 text-amber-600/70 dark:text-amber-400/60 hover:text-amber-900 dark:hover:text-amber-200 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
