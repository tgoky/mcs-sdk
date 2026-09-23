"use client";

// The proactive half of onboarding — first-time users don't reliably
// notice a small icon next to the breadcrumb trail, so this shows once,
// unprompted, on the dashboard home for a workspace that's never touched
// a tour (which in practice means right after creating a new client —
// workspace creation always redirects to /dashboard, and a brand-new
// engagement has no tour progress yet). A real modal (not an inline
// banner) so it reads as a deliberate "you're new here, pick a path"
// moment instead of something to scroll past — sized and paced like a
// first-impression screen (icon badge, one visually dominant default
// path, one clearly secondary one) rather than reusing
// components/modal.tsx's compact settings-form chrome, which is
// deliberately small because everything else that uses it is a dense
// form, not a welcome moment.
//
// The second path is state-aware rather than a blind "set up your first
// worker": workspace creation (/home/new) already makes the caller pick
// at least one product before the workspace exists at all, so by the time
// this shows, "set up your first worker" is frequently already false —
// telling someone that right after they just installed something reads
// as the modal not having noticed. dashboard/page.tsx passes down what's
// actually installed and enabled so this can say the true next step:
// nothing installed -> go install one; installed but nothing enabled yet
// -> finish configuring what's already there; already running something
// -> there's no "first worker" step left, so that path disappears
// entirely rather than showing a stale one.
//
// Dismissing it (any remaining path below, Escape, the backdrop, or the
// X) is remembered the same way real tour progress is — see tour-
// provider.tsx's dismissWelcome — so it never nags twice. The breadcrumb
// launcher (tour-launcher.tsx) stays there permanently either way, for
// anyone who skips this and wants a tour later.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Compass, PlayCircle, ListChecks, X, ArrowRight } from "lucide-react";
import { useTour } from "./tour-provider";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";

export function TourWelcomeNudge({
  installedProductIds,
  hasEnabledAnyWorker,
}: {
  /** Product ids already installed in this workspace — createWorkspace
   * requires picking at least one, so this is normally non-empty by the
   * time a brand-new workspace lands here. */
  installedProductIds: string[];
  /** Whether the workspace's primary engagement has any worker actually
   * enabled yet — true means there's no "set up a worker" step left to
   * offer at all, installed or not. */
  hasEnabledAnyWorker: boolean;
}) {
  const router = useRouter();
  const { tours, hasSeenWelcome, start, dismissWelcome } = useTour();
  const fullWalkthrough = tours.find((t) => t.id === "full-walkthrough");
  const show = !hasSeenWelcome && Boolean(fullWalkthrough);

  const installedProducts = WORKSPACE_PRODUCTS.filter((p) => installedProductIds.includes(p.id));

  // Same escape/scroll-lock contract as components/modal.tsx, kept local
  // rather than shared since this is the only consumer that needs the
  // larger chrome below. The hook still runs every render regardless of
  // `show` so hook order never changes across renders.
  useEffect(() => {
    if (!show) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismissWelcome();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [show, dismissWelcome]);

  if (!show || typeof document === "undefined") return null;

  // Three real states, not one generic "set up your first worker" line:
  //  - nothing enabled yet, exactly one product installed -> name it and
  //    send them straight to that product's own Library page.
  //  - nothing enabled yet, multiple (or somehow zero) installed -> send
  //    them to the Library index instead of guessing which one to name.
  //  - something's already enabled -> there's no setup step left to
  //    offer, so this path is omitted entirely rather than shown stale.
  const setupAction = hasEnabledAnyWorker
    ? null
    : installedProducts.length === 1
      ? {
          label: `Finish setting up ${installedProducts[0].name}`,
          body: "You already picked it. Enable a worker to start running it for real.",
          href: `/dashboard/library/${installedProducts[0].id}`,
        }
      : {
          label: "Finish setting up your workers",
          body:
            installedProducts.length > 1
              ? `Enable a worker in any of your ${installedProducts.length} installed products.`
              : "Head to the Library and install your first product.",
          href: "/dashboard/library",
        };

  function goToSetupAction() {
    dismissWelcome();
    if (setupAction) router.push(setupAction.href);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4 overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismissWelcome();
      }}
    >
      <div className="relative w-full max-w-md my-8 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-background shadow-2xl motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200">
        <button
          type="button"
          onClick={dismissWelcome}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-400 dark:text-zinc-600 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-7 pt-8 pb-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-elevation-2">
            <Compass className="w-7 h-7 text-white" strokeWidth={2} />
          </div>
          <h2 className="mt-4 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Welcome to UTP
          </h2>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            New workspace, real client. Take a quick, real walkthrough of the dashboard, the Library, and
            every worker, or jump straight to what&apos;s next.
          </p>
        </div>

        <div className="p-6 pt-4 space-y-2.5">
          <button
            type="button"
            onClick={() => start(fullWalkthrough!.id)}
            className="group w-full flex items-center gap-3.5 rounded-xl bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 px-4 py-3.5 text-left transition-colors cursor-pointer shadow-elevation-1"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 dark:bg-zinc-900/10">
              <PlayCircle size={18} className="text-white dark:text-zinc-900" />
            </div>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white dark:text-zinc-900">Run the full walkthrough</span>
              <span className="block text-xs text-zinc-300 dark:text-zinc-600 leading-snug mt-0.5">
                Dashboard, Library, and every worker. A few minutes, start to finish.
              </span>
            </span>
            <ArrowRight
              size={16}
              className="shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform group-hover:translate-x-0.5"
            />
          </button>

          {setupAction && (
            <button
              type="button"
              onClick={goToSetupAction}
              className="group w-full flex items-center gap-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 px-4 py-3.5 text-left transition-colors cursor-pointer"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <ListChecks size={18} className="text-zinc-600 dark:text-zinc-300" />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-zinc-900 dark:text-white">{setupAction.label}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5">
                  {setupAction.body}
                </span>
              </span>
              <ArrowRight
                size={16}
                className="shrink-0 text-zinc-300 dark:text-zinc-700 transition-transform group-hover:translate-x-0.5"
              />
            </button>
          )}

          <button
            type="button"
            onClick={dismissWelcome}
            className="w-full text-center text-xs font-medium text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 py-2 transition-colors cursor-pointer"
          >
            I&apos;ll explore on my own
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
