"use client";

// The visible half of a tour — a dimmed backdrop with a spotlight cutout
// around the current step's real element, plus a Floating UI tooltip
// anchored to it. Same visual language as the app's own Modal (bg-
// background/border-border tokens, rounded-lg, shadow-2xl, motion-safe
// animate-in fade-in/zoom-in-95) so this reads as one system in both
// themes automatically — it inherits whatever those tokens resolve to,
// nothing here hardcodes a light or dark color.
//
// The spotlight rect glides (CSS transition, not a snap) to each new
// target and gets a brief pulse ring on arrival — the "someone's
// pointing this out to you" motion touch, without a recorded video.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloating, offset, flip, shift, arrow, autoUpdate, FloatingArrow, FloatingPortal } from "@floating-ui/react";
import { ArrowUpRight, ArrowUpLeft, X, Loader2 } from "lucide-react";
import { useTour } from "./tour-provider";

const SPOTLIGHT_PADDING = 8;

export function TourOverlay() {
  const { activeTourId, tours, activeStepIndex, activeStepTotal, targetEl, isWaiting, next, back, close } = useTour();
  const activeTour = tours.find((t) => t.id === activeTourId) ?? null;
  const activeStep = activeTour?.steps[activeStepIndex] ?? null;

  const arrowRef = useRef<SVGSVGElement>(null);
  const { refs, floatingStyles, context, placement } = useFloating({
    open: Boolean(targetEl),
    elements: { reference: targetEl },
    placement: activeStep?.placement ?? "bottom",
    whileElementsMounted: autoUpdate,
    middleware: [offset(14), flip({ padding: 16 }), shift({ padding: 16 }), arrow({ element: arrowRef, padding: 8 })],
  });

  // Tracks the target's own rect separately from the tooltip's floating
  // position — the spotlight cutout needs to move/resize with it too,
  // and autoUpdate above only drives refs.setFloating's positioning.
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!targetEl) {
      setRect(null);
      return;
    }
    const update = () => setRect(targetEl.getBoundingClientRect());
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(targetEl);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [targetEl]);

  useEffect(() => {
    refs.setReference(targetEl);
  }, [targetEl, refs]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!activeTourId) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowUpRight") next();
      if (e.key === "ArrowUpLeft") back();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeTourId, close, next, back]);

  if (!activeTour || !activeStep || typeof document === "undefined") return null;

  const isFirst = activeStepIndex === 0;
  const isLast = activeStepIndex === activeStepTotal - 1;

  return createPortal(
    // pointer-events-none on the whole overlay is deliberate and load-
    // bearing, not decorative: this div is `fixed inset-0` at a high
    // z-index for the entire time a tour is active — including every
    // second spent waiting for a step's target to appear. Without this,
    // it silently swallows every click on the real page underneath it
    // (the spotlight ring's own pointer-events-none only passes clicks
    // through to whatever's behind IT, which is this same wrapper) — the
    // exact "page just hangs, nothing responds to clicks" symptom. The
    // floating tooltip's buttons live in their own FloatingPortal, a
    // separate DOM subtree, so they stay fully clickable regardless.
    <div className="fixed inset-0 z-[9997] pointer-events-none font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200" aria-live="polite">
      {/* Backdrop with the spotlight punched out via a huge box-shadow on
          the cutout rect itself — no SVG mask needed, and it glides
          between targets via the transition below instead of snapping. */}
      {rect ? (
        <div
          className="absolute rounded-xl ring-2 ring-amber-400/80 pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        >
          <span className="absolute inset-0 rounded-xl ring-2 ring-amber-400/60 motion-safe:animate-ping" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-black/40 dark:bg-black/55 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200" />
      )}

      {isWaiting && !rect && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-background border border-border px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 shadow-lg motion-safe:animate-in motion-safe:fade-in">
          <Loader2 size={13} className="animate-spin" />
          Finding the next step…
        </div>
      )}

      {targetEl && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[9998] w-[300px] rounded-lg border border-border bg-background shadow-2xl font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200"
          >
            <FloatingArrow ref={arrowRef} context={context} className="fill-background [&>path:first-child]:stroke-border [&>path:first-child]:stroke-1" />
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {activeTour.label} · {activeStepIndex + 1}/{activeStepTotal}
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close tour"
                  className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer p-0.5 -m-0.5 rounded"
                >
                  <X size={14} />
                </button>
              </div>

              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{activeStep.title}</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mt-1">{activeStep.body}</p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={back}
                  disabled={isFirst}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-0 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <ArrowUpLeft size={12} /> Back
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: activeStepTotal }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1 rounded-full transition-all duration-200 ${
                        i === activeStepIndex ? "w-4 bg-amber-500" : "w-1 bg-zinc-200 dark:bg-zinc-700"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 px-3 py-1.5 text-xs font-bold text-white dark:text-zinc-900 transition-colors cursor-pointer"
                >
                  {isLast ? "Finish" : "Next"} <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </FloatingPortal>
      )}
    </div>,
    document.body
  );
}
