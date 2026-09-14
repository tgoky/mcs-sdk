"use client";

// The proactive half of onboarding — first-time users don't reliably
// notice a small icon next to the breadcrumb trail, so this shows once,
// unprompted, on the dashboard home for a workspace that's never touched
// a tour. A real modal (not an inline banner) so it reads as a deliberate
// "you're new here, pick a path" moment instead of something to scroll
// past. Dismissing it (any of the 3 paths below, Escape, or the backdrop)
// is remembered the same way real tour progress is — see tour-
// provider.tsx's dismissWelcome — so it never nags twice. The breadcrumb
// launcher (tour-launcher.tsx) stays there permanently either way, for
// anyone who skips this and wants a tour later.

import { useRouter } from "next/navigation";
import { Compass, PlayCircle, ListChecks } from "lucide-react";
import { Modal } from "@/components/modal";
import { useTour } from "./tour-provider";

export function TourWelcomeNudge() {
  const router = useRouter();
  const { tours, hasSeenWelcome, start, dismissWelcome } = useTour();
  const fullWalkthrough = tours.find((t) => t.id === "full-walkthrough");

  if (hasSeenWelcome || !fullWalkthrough) return null;

  function goSetUpFirstWorker() {
    dismissWelcome();
    router.push("/dashboard/library");
  }

  return (
    <Modal title="Welcome to Mudd" icon={Compass} onClose={dismissWelcome} maxWidthClass="max-w-md">
      <div className="space-y-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          New workspace, real client — take a quick, real walkthrough of the dashboard, the Library, and every
          worker, or skip straight to setting one up.
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => start(fullWalkthrough.id)}
            className="w-full flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 px-3 py-2.5 text-left transition-colors cursor-pointer"
          >
            <PlayCircle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-amber-900 dark:text-amber-200">Run the full walkthrough</span>
              <span className="block text-[11px] text-amber-700/80 dark:text-amber-400/80 leading-snug">
                Dashboard, Library, and every worker — a few minutes, start to finish.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={goSetUpFirstWorker}
            className="w-full flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 px-3 py-2.5 text-left transition-colors cursor-pointer"
          >
            <ListChecks size={16} className="text-zinc-500 dark:text-zinc-400 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-zinc-900 dark:text-white">Set up my first worker</span>
              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                Skip the tour — go straight to the Library and install one.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={dismissWelcome}
            className="w-full text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 py-1.5 transition-colors cursor-pointer"
          >
            I&apos;ll explore on my own
          </button>
        </div>
      </div>
    </Modal>
  );
}
