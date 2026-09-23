"use client";

// The state machine behind every interactive tour. Mounted once, in
// src/app/dashboard/layout.tsx, above `{children}` — that's what lets a
// tour survive a route change (dashboard -> Library -> an engagement's
// own skill page): the provider itself never unmounts, only the page
// content underneath it does.
//
// Branching and async waits are both handled the same, deliberately
// simple way instead of a bespoke DSL: a step names a route and a
// `[data-tour="..."]` target. On each step this provider (1) navigates
// there if we're not already on it, then (2) polls for that selector to
// exist in the DOM. If it appears, the step shows. If it never does
// within a few seconds — because a product isn't onboarded yet, a
// workspace has no client, a panel is conditionally hidden, whatever the
// real reason is — the step is skipped automatically and the tour moves
// on. The app's own render logic is the only source of truth for what's
// "reachable" right now; this provider never duplicates it.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TOURS, resolveTourRoute } from "@/lib/tours/tour-definitions";
import type { TourProgressMap } from "@/lib/tours/types";

const TARGET_POLL_MS = 150;
const TARGET_WAIT_TIMEOUT_MS = 4000;

interface TourContextValue {
  tours: typeof TOURS;
  progressByTour: TourProgressMap;
  activeTourId: string | null;
  activeStepIndex: number;
  activeStepTotal: number;
  /** The live DOM node the current step is anchored to — null while
   * still navigating/waiting for it to appear. */
  targetEl: HTMLElement | null;
  isWaiting: boolean;
  start: (tourId: string, opts?: { resume?: boolean }) => void;
  next: () => void;
  back: () => void;
  close: () => void;
  dismissWelcome: () => void;
  /** True once this workspace has ever started any tour OR explicitly
   * dismissed the welcome nudge — tour-welcome-nudge.tsx uses this to
   * show itself exactly once, ever, per workspace. */
  hasSeenWelcome: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

export function TourProvider({
  engagementId,
  initialProgress,
  operatorHasSeenTours = false,
  children,
}: {
  /** The workspace's primary engagement — every tour is scoped to it,
   * same convention the Library and WorkersPanel already use for
   * anything product-related that isn't tied to a specific engagement
   * page in the URL. Tours are unusable (start() no-ops) without one —
   * there's nothing to point at yet for a brand-new workspace. */
  engagementId: string | null;
  initialProgress: TourProgressMap;
  /** Any of this operator's clients has tour progress — the welcome nudge
   * is shown once per operator, not once per workspace. */
  operatorHasSeenTours?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [progressByTour, setProgressByTour] = useState<TourProgressMap>(initialProgress);
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);

  const activeTour = activeTourId ? TOURS.find((t) => t.id === activeTourId) ?? null : null;
  const activeStep = activeTour?.steps[activeStepIndex] ?? null;

  // Guards the poll loop below against a stale closure advancing a step
  // that's no longer current (e.g. the user hit Skip mid-wait).
  const stepTokenRef = useRef(0);

  const persist = useCallback(
    (tourId: string, status: "in_progress" | "completed", currentStepId: string, completedStepIds: string[]) => {
      if (!engagementId) return;
      const entry = { status, currentStepId, completedStepIds, updatedAt: new Date().toISOString() };
      setProgressByTour((prev) => ({ ...prev, [tourId]: entry }));
      fetch(`/api/engagements/${engagementId}/tours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourId, ...entry }),
      }).catch(() => {
        // Best-effort — a failed save just means resume falls back to
        // step 0 next time, not a broken tour right now.
      });
    },
    [engagementId]
  );

  const advanceOrEnd = useCallback(
    (fromIndex: number) => {
      if (!activeTour) return;
      const nextIndex = fromIndex + 1;
      if (nextIndex >= activeTour.steps.length) {
        const allStepIds = activeTour.steps.map((s) => s.id);
        persist(activeTour.id, "completed", activeTour.steps[activeTour.steps.length - 1].id, allStepIds);
        setActiveTourId(null);
        setTargetEl(null);
        return;
      }
      setActiveStepIndex(nextIndex);
    },
    [activeTour, persist]
  );

  // The wait/branch loop: run whenever the active step changes.
  useEffect(() => {
    if (!activeTour || !activeStep) {
      setTargetEl(null);
      setIsWaiting(false);
      return;
    }

    const myToken = ++stepTokenRef.current;
    setTargetEl(null);

    if (activeStep.enabled && !activeStep.enabled()) {
      advanceOrEnd(activeStepIndex);
      return;
    }

    const resolvedRoute = resolveTourRoute(activeStep.route, engagementId);
    if (resolvedRoute && pathname !== resolvedRoute) {
      router.push(resolvedRoute);
      // The poll below still runs — it just won't find anything until
      // the new route's content mounts, which is exactly the "async
      // element" case this loop already handles.
    }

    setIsWaiting(true);
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (stepTokenRef.current !== myToken) {
        clearInterval(interval);
        return;
      }
      const el = document.querySelector<HTMLElement>(activeStep.target);
      if (el) {
        clearInterval(interval);
        setIsWaiting(false);
        setTargetEl(el);
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        // Progress is "reached this step," not "clicked Next" — a step
        // the tour skipped never lands in completedStepIds.
        const completedSoFar = activeTour.steps.slice(0, activeStepIndex).map((s) => s.id);
        persist(activeTour.id, "in_progress", activeStep.id, [...completedSoFar, activeStep.id]);
        return;
      }
      if (Date.now() - startedAt > TARGET_WAIT_TIMEOUT_MS) {
        clearInterval(interval);
        setIsWaiting(false);
        advanceOrEnd(activeStepIndex);
      }
    }, TARGET_POLL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTourId, activeStepIndex]);

  const start = useCallback(
    (tourId: string, opts?: { resume?: boolean }) => {
      if (!engagementId) return;
      const tour = TOURS.find((t) => t.id === tourId);
      if (!tour) return;
      const resumeStepId = opts?.resume ? progressByTour[tourId]?.currentStepId : undefined;
      const resumeIndex = resumeStepId ? tour.steps.findIndex((s) => s.id === resumeStepId) : -1;
      setActiveTourId(tourId);
      setActiveStepIndex(resumeIndex >= 0 ? resumeIndex : 0);
    },
    [engagementId, progressByTour]
  );

  const next = useCallback(() => advanceOrEnd(activeStepIndex), [advanceOrEnd, activeStepIndex]);
  const back = useCallback(() => setActiveStepIndex((i) => Math.max(0, i - 1)), []);
  const close = useCallback(() => {
    stepTokenRef.current++;
    setActiveTourId(null);
    setTargetEl(null);
    setIsWaiting(false);
  }, []);

  // The first-visit nudge banner (tour-welcome-nudge.tsx) needs its own
  // one-time dismissal that survives a reload, same as real tour
  // progress — reusing this exact persistence path under a reserved id
  // instead of a second endpoint for what's functionally the same fact
  // ("this workspace has seen the tours and made a choice about them").
  const dismissWelcome = useCallback(() => persist("welcome-nudge", "completed", "dismissed", []), [persist]);
  const hasSeenWelcome = operatorHasSeenTours || Boolean(progressByTour["welcome-nudge"]) || Object.keys(progressByTour).length > 0;

  const value = useMemo<TourContextValue>(
    () => ({
      tours: TOURS,
      progressByTour,
      activeTourId,
      activeStepIndex,
      activeStepTotal: activeTour?.steps.length ?? 0,
      targetEl,
      isWaiting,
      start,
      next,
      back,
      close,
      dismissWelcome,
      hasSeenWelcome,
    }),
    [progressByTour, activeTourId, activeStepIndex, activeTour, targetEl, isWaiting, start, next, back, close, dismissWelcome, hasSeenWelcome]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
