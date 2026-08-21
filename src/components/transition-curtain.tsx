"use client";

import { useEffect } from "react";

const CURTAIN_ID = "mv-curtain";

/**
 * Call before router.push. Appends a real DOM node to <body>
 * that survives React's tree swap because React doesn't own it.
 */
export function createCurtain() {
  if (document.getElementById(CURTAIN_ID)) return;
  const el = document.createElement("div");
  el.id = CURTAIN_ID;
  el.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#000;pointer-events:none;";
  document.body.appendChild(el);
}

/**
 * Drop into your root layout. On every navigation it checks
 * for the curtain and removes it AFTER the browser has painted
 * the new page — so content is always behind the black, never after it.
 */
export function TransitionCurtain() {
  useEffect(() => {
    const el = document.getElementById(CURTAIN_ID);
    if (!el) return;

    // Double-rAF: guarantees the browser has committed at least
    // one paint of the new page before we pull the curtain away.
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.remove();
      });
    });

    return () => cancelAnimationFrame(id);
  }, []);

  return null;
}