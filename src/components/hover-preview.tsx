"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 350; // long enough that a mouse just passing through a row doesn't trigger it
const CLOSE_DELAY_MS = 150; // short grace period so moving from the row into the popover itself doesn't close it
const PANEL_WIDTH = 380; // Expanded width so content has room to breathe

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
    const flip = spaceRight < PANEL_WIDTH + 24; // not enough room on the right – show it to the left instead

    const left = flip ? rect.left - PANEL_WIDTH - 12 : rect.right + 12;
    const top = Math.min(Math.max(rect.top, 8), window.innerHeight - 180);

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
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-black/50 p-4 text-xs text-zinc-200 leading-relaxed">
        {preview}
      </div>
    </div>,
    document.body
  );
}

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