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
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  panelWidth?: number;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  function toggle() {
    setOpen((o) => !o);
  }
  function close() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = Math.min(rect.bottom + 8, window.innerHeight - VIEWPORT_MARGIN);
    let left = align === "end" ? rect.right - panelWidth : rect.left;
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - panelWidth - VIEWPORT_MARGIN);
    setCoords({ top, left });
  }, [open, align, panelWidth]);

  // Deliberately no scroll/resize listeners here — see the file doc above.
  useEffect(() => {
    if (!open) return;

    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
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
              style={{ position: "fixed", top: coords.top, left: coords.left, width: panelWidth }}
              className="z-50 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 motion-safe:origin-top-right"
            >
              <div
                ref={panelRef}
                role="dialog"
                className="rounded-2xl surface-glass-3 text-zinc-900 dark:text-zinc-100 max-h-[80vh] overflow-y-auto font-sans antialiased"
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
