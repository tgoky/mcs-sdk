"use client";

// The persistent way back into a tour once someone's skipped it —
// lives right next to the breadcrumb trail (top-nav.tsx) on every
// dashboard page, not just the ones a tour happens to cover, so it's
// always in the same spot regardless of where the click actually came
// from.

import { useState } from "react";
import { Compass, Check, PlayCircle, Rocket } from "lucide-react";
import { useTour } from "./tour-provider";

export function TourLauncher() {
  const { tours, progressByTour, activeTourId, start } = useTour();
  const [open, setOpen] = useState(false);

  const namedTours = tours.filter((t) => t.id !== "full-walkthrough" && !t.hidden);
  const fullWalkthrough = tours.find((t) => t.id === "full-walkthrough");
  // Only tours the picker lists: a hidden one in progress can't be resumed from here.
  const anyInProgress = tours.some((t) => !t.hidden && progressByTour[t.id]?.status === "in_progress");

  function pick(tourId: string) {
    const resume = progressByTour[tourId]?.status === "in_progress";
    start(tourId, { resume });
    setOpen(false);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Take a tour"
        aria-label="Take a tour"
        data-tour="tour-launcher"
        className={`relative flex items-center justify-center h-6 w-6 rounded-lg transition-colors cursor-pointer before:content-[''] before:absolute before:-inset-2 ${
          activeTourId
            ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40"
            : "text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        }`}
      >
        <Compass size={13} />
        {anyInProgress && !activeTourId && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 ring-2 ring-background" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 w-72 bg-background border border-border rounded-lg shadow-xl z-50 py-1.5 font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-100">
            <p className="px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
              Take a tour
            </p>
            <div className="space-y-0.5 px-1">
              {namedTours.map((tour) => {
                const progress = progressByTour[tour.id];
                return (
                  <button
                    key={tour.id}
                    type="button"
                    onClick={() => pick(tour.id)}
                    className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                  >
                    <span className="mt-0.5 shrink-0">
                      {progress?.status === "completed" ? (
                        <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                      ) : progress?.status === "in_progress" ? (
                        <PlayCircle size={13} className="text-amber-500" />
                      ) : (
                        <span className="block w-[13px] h-[13px] rounded-full border border-zinc-300 dark:border-zinc-700" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {tour.label}
                        {progress?.status === "in_progress" && <span className="ml-1.5 text-[10px] font-mono text-amber-600 dark:text-amber-400">resume</span>}
                      </span>
                      <span className="block text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-2">{tour.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {fullWalkthrough && (
              <>
                <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1.5 mx-2" />
                <div className="px-1">
                  <button
                    type="button"
                    onClick={() => pick(fullWalkthrough.id)}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors cursor-pointer"
                  >
                    <Rocket size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-amber-800 dark:text-amber-300">
                        {fullWalkthrough.label}
                        {progressByTour[fullWalkthrough.id]?.status === "in_progress" && (
                          <span className="ml-1.5 text-[10px] font-mono font-normal">resume</span>
                        )}
                      </span>
                      <span className="block text-[10.5px] text-amber-700/80 dark:text-amber-400/80 leading-snug">{fullWalkthrough.description}</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
