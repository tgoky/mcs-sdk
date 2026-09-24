"use client";

// src/components/product-setup/anchored-card.tsx
//
// The small card every setup control opens from (a tool's logo, a word in
// the "what we learned" sentence, a line in "what runs"). It grows out of
// the thing that was clicked and shrinks back into it: an outside click,
// Escape, or the caller closing it all collapse it the same way. Portaled
// and flip/shift-positioned so it's never clipped by a panel it's inline in.

import { useState, type ReactNode } from "react";
import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export function AnchoredCard({
  open,
  onOpenChange,
  anchor,
  children,
  width = 320,
  placement = "bottom",
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Renders the thing the card grows from; spread `props` onto it. */
  anchor: (props: { ref: (node: HTMLElement | null) => void } & Record<string, unknown>) => ReactNode;
  children: ReactNode;
  width?: number;
  placement?: Placement;
  /** Accessible name for the dialog. */
  label: string;
}) {
  const reduceMotion = useReducedMotion();
  // Elements held in state rather than read off `refs` during render.
  const [reference, setReference] = useState<HTMLElement | null>(null);
  const [floating, setFloating] = useState<HTMLElement | null>(null);
  const { floatingStyles, context, placement: finalPlacement } = useFloating({
    elements: { reference, floating },
    open,
    onOpenChange,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableWidth, elements }) {
          elements.floating.style.maxWidth = `${Math.min(width, availableWidth)}px`;
        },
      }),
    ],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "dialog" }),
  ]);

  const side = finalPlacement.split("-")[0];
  const origin = side === "top" ? "bottom center" : side === "left" ? "center right" : side === "right" ? "center left" : "top center";

  return (
    <>
      {anchor({ ref: setReference, ...getReferenceProps() })}
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus>
              <div ref={setFloating} data-floating-layer="" style={{ ...floatingStyles, width, zIndex: 60 }} aria-label={label} {...getFloatingProps()}>
                <motion.div
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82, y: side === "top" ? 6 : -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88, y: side === "top" ? 4 : -4 }}
                  transition={reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
                  style={{ transformOrigin: origin }}
                  className="rounded-xl border bg-background text-[var(--text-primary)] shadow-elevation-3 overflow-hidden"
                >
                  {children}
                </motion.div>
              </div>
            </FloatingFocusManager>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
