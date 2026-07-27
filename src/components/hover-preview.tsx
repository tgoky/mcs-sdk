"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 350; // long enough that a mouse just passing through a row doesn't trigger it
const CLOSE_DELAY_MS = 150; // short grace period so moving from the row into the popover itself doesn't close it
const PANEL_WIDTH = 300;

/**
 * Renders `preview` in a small floating card anchored next to whatever
 * element `anchorRef` points at, once `hovering` goes true — not a centered
 * modal, no backdrop blur. Rendered via a portal to `document.body` so it
 * isn't clipped by a table's `overflow-x-auto` ancestor (setting overflow-x
 * forces overflow-y to compute as `auto` too, per the CSS spec, so anything
 * absolutely positioned inside that container would get cut off or force a
 * scrollbar otherwise).
 *
 * The caller owns the anchor ref and the hover state (attach `ref` and
 * onMouseEnter/onMouseLeave directly on the row in JSX — see
 * `useHoverPreview` below for the common wiring) rather than this
 * component cloning the row to inject them, since forwarding a ref through
 * cloneElement across a function boundary is exactly the pattern the
 * project's react-hooks/refs lint rule flags.
 */
export function HoverPreview({
  anchorRef,
  hovering,
  preview,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  hovering: boolean;
  preview: ReactNode;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number; flip: boolean } | null>(null);

  useEffect(() => {
    if (!hovering) return;
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const flip = spaceRight < PANEL_WIDTH + 24; // not enough room on the right — show it to the left instead
    const left = flip ? rect.left - PANEL_WIDTH - 10 : rect.right + 10;
    const top = Math.min(Math.max(rect.top, 8), window.innerHeight - 160);
    setCoords({ top, left: Math.max(8, left), flip });
  }, [hovering, anchorRef]);

  if (!hovering || !coords || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{ position: "fixed", top: coords.top, left: coords.left, width: PANEL_WIDTH, zIndex: 9999 }}
      className={[
        "pointer-events-none motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150",
        coords.flip ? "motion-safe:origin-top-right" : "motion-safe:origin-top-left",
      ].join(" ")}
    >
      <div className="rounded-lg border border-border bg-card shadow-lg p-3.5 text-xs">
        {preview}
      </div>
    </div>,
    document.body
  );
}

/**
 * Wires up the open-delay/close-delay hover behavior for one row: attach
 * the returned `ref`, `onMouseEnter`, and `onMouseLeave` to the row element
 * directly in JSX, then render `<HoverPreview anchorRef={ref} hovering={hovering} preview={...} />`
 * as a sibling. Kept as a hook (rather than folded into HoverPreview
 * itself) so the row keeps a plain, literal JSX ref — no cloneElement
 * involved anywhere.
 */
export function useHoverPreview<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [hovering, setHovering] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const onMouseEnter = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => setHovering(true), OPEN_DELAY_MS);
  }, [clearTimers]);

  const onMouseLeave = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setHovering(false), CLOSE_DELAY_MS);
  }, [clearTimers]);

  // Scrolling or resizing while a preview is open would leave it pointing at
  // stale coordinates — just close it rather than tracking scroll, since a
  // preview mid-flight from a scroll gesture is more distracting than useful.
  useEffect(() => {
    if (!hovering) return;
    const close = () => setHovering(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [hovering]);

  return { ref, hovering, onMouseEnter, onMouseLeave };
}
