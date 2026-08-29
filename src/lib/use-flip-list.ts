"use client";

// Smooths list reorders/insertions for lists whose data is wholesale-replaced
// on a poll (e.g. queue-panel.tsx's `setItems(data.items ?? [])` every
// POLL_MS) instead of patched in place. Without this, a higher-priority item
// arriving mid-list makes every row below it snap to a new position the
// instant React reconciles — jarring on an 8s cadence.
//
// This is the standard FLIP (First, Last, Invert, Play) technique: measure
// element positions before a DOM update, let React commit the update, measure
// again, then play a transform from the old delta back to zero. No layout
// library — the Web Animations API handles the actual tween, `will-change`
// is only applied for the animation's lifetime, and it fully backs off under
// prefers-reduced-motion (matching the guard already used for the prefill
// and step-spine keyframes in globals.css).
//
// Deliberately narrow: it only smooths POSITION changes on elements tagged
// `data-flip-id`. It does not fade in new rows or fade out removed ones —
// removal already has its own dedicated collapse animation (see
// closeItemWithAnimation in queue-panel.tsx), and layering a second
// animation on top of that would fight it rather than help.

import { useLayoutEffect, useRef } from "react";

const FLIP_DURATION_MS = 240;
// Snappy ease-out, no overshoot — matches the app's existing "quick and
// mechanical, not bouncy" motion (see the calendar sheet-flip spec's
// stiffness/damping notes) rather than a springy overshoot.
const FLIP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * @param containerRef Ref to the element containing the flipped rows.
 * @param ids Ordered ids representing what's currently rendered inside the
 *   container (top-level rows plus any expanded nested rows). Pass a new
 *   array reference only when membership/order actually changes — the hook
 *   re-measures on every array identity change, so a memoized list matters
 *   for a panel this size.
 */
export function useFlipList(containerRef: React.RefObject<HTMLElement | null>, ids: readonly string[]) {
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const hasMountedRef = useRef(false);
  // Re-run only when the actual set/order of ids changes, not on every
  // unrelated re-render (hover state, a single row going "busy", etc.) —
  // this is what keeps the getBoundingClientRect() pass cheap on an 8s poll.
  const key = ids.join("\u0000");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const nodes = new Map<string, HTMLElement>();
    const nextRects = new Map<string, DOMRect>();
    container.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((el) => {
      const id = el.dataset.flipId;
      if (!id) return;
      nodes.set(id, el);
      nextRects.set(id, el.getBoundingClientRect());
    });

    const shouldAnimate = hasMountedRef.current && !prefersReducedMotion();

    if (shouldAnimate) {
      const prevRects = prevRectsRef.current;
      for (const [id, node] of nodes) {
        const before = prevRects.get(id);
        const after = nextRects.get(id);
        if (!before || !after) continue; // brand-new row — nothing to invert from, just appear in place

        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue; // didn't actually move

        node.style.willChange = "transform";
        const animation = node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration: FLIP_DURATION_MS, easing: FLIP_EASING }
        );
        animation.onfinish = animation.oncancel = () => {
          node.style.willChange = "";
        };
      }
    }

    prevRectsRef.current = nextRects;
    hasMountedRef.current = true;
    // `key` is the real dependency (see above); containerRef/ids are stable
    // identities we read imperatively inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
