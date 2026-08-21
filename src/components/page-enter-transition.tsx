"use client";

import { useState, useEffect, type ReactNode } from "react";
import { hasPendingTransition, clearTransition } from "@/lib/page-transition";

export function PageEnterTransition({ children }: { children: ReactNode }) {
  // Read sessionStorage synchronously during initial client render
  // so the overlay is present from the very first paint — no flash.
  const [pending] = useState(() => {
    if (typeof window === "undefined") return false;
    return hasPendingTransition();
  });

  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }

    // Double-rAF guarantees the browser has committed the overlay
    // at opacity 1 before we kick off the fade-out CSS transition.
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(false);
      });
    });

    return () => cancelAnimationFrame(id);
  }, [pending]);

  // Fast path — no incoming transition, render children directly
  if (!pending) return <>{children}</>;

  return (
    <>
      <div
        suppressHydrationWarning
        onTransitionEnd={() => {
          if (!visible) clearTransition();
        }}
        className="fixed inset-0 z-[9999] bg-black pointer-events-none"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 400ms cubic-bezier(0, 0, 0.2, 1)",
        }}
      />
      {children}
    </>
  );
}