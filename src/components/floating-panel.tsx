"use client";

// src/components/floating-panel.tsx
//
// Same portal-to-document.body + glass treatment as ActionMenu
// (action-menu.tsx), but built for a wide form/settings panel instead of
// a short menu list:
// - Wider by default, no flip-above-if-not-enough-room logic (its own
//   max-height + internal scroll handles overflow instead).
// - Does NOT close on scroll or window resize. ActionMenu closes on
//   both — reasonable for a menu (the anchor moved, bail), but for a
//   panel tall enough to need its own internal scrolling, scrolling
//   inside it is a real scroll event that ActionMenu's listener treats
//   as "user scrolled the page" and closes on — which is exactly what
//   made a config form "disappear" while editing a field further down.
//   A mobile keyboard opening fires a resize for the same reason.  Only
//   an outside click or Escape closes this one.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 12;

export function FloatingPanel({
  trigger,
  children,
  align = "end",
  panelWidth = 480,
  defaultOpen = false,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  panelWidth?: number;
  /** Start open, for a link that means "take me to these settings". */
  defaultOpen?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  function toggle() {
    setOpen((o) => !o);
  }
  function close() {
    setOpen(false);
  }

  const [resolvedWidth, setResolvedWidth] = useState(panelWidth);

  useEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // On a narrow viewport (phones), the panel can't be wider than the
    // screen minus margin on both sides — clamping only `left` and not
    // the width left it rendering full-width off the left edge of any
    // phone screen, unreachable and unclosable by normal means.
    const width = Math.min(panelWidth, window.innerWidth - VIEWPORT_MARGIN * 2);
    const top = Math.min(rect.bottom + 8, window.innerHeight - VIEWPORT_MARGIN);
    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - width - VIEWPORT_MARGIN);
    setResolvedWidth(width);
    // Ends above the bottom of the screen: 80vh from wherever the anchor
    // sits ran past it, so a form's own save bar at the bottom of the
    // panel was below the fold and couldn't be scrolled to.
    const maxHeight = Math.max(160, window.innerHeight - top - VIEWPORT_MARGIN);
    setCoords({ top, left, maxHeight });
  }, [open, align, panelWidth]);

  // Deliberately no scroll/resize listeners here — see the file doc above.
  useEffect(() => {
    if (!open) return;

    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      // A card opened from inside this panel (a tool's connect card, a value's
      // editor) is portaled outside it; clicking in it isn't clicking away.
      if (target instanceof Element && target.closest("[data-floating-layer]")) return;
      close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={anchorRef} className="inline-flex">
      {trigger({ open, toggle })}
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              style={{ position: "fixed", top: coords.top, left: coords.left, width: resolvedWidth }}
              className="z-50 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 motion-safe:origin-top-right"
            >
              <div
                ref={panelRef}
                role="dialog"
                style={{ maxHeight: coords.maxHeight }}
                className="rounded-lg surface-glass-3 text-zinc-900 dark:text-zinc-100 overflow-y-auto font-sans antialiased"
              >
                {typeof children === "function" ? children(close) : children}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
