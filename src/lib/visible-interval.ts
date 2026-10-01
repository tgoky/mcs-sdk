// src/lib/visible-interval.ts
//
// setInterval for polling the server, but only while the tab is visible.
// A hidden tab used to keep polling every few seconds forever, so a user
// with the dashboard open in a background tab cost as much as one actively
// looking at it. Coming back to the tab polls once right away, so what's
// shown is never older than one interval.

/** Starts polling; returns a function that stops it. Browser-only. */
export function setVisibleInterval(tick: () => void, ms: number): () => void {
  let id: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    if (id === null) id = setInterval(tick, ms);
  };
  const stop = () => {
    if (id !== null) {
      clearInterval(id);
      id = null;
    }
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      tick();
      start();
    } else {
      stop();
    }
  };

  if (document.visibilityState === "visible") start();
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
