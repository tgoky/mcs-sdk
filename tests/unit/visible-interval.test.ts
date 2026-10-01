// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setVisibleInterval } from "@/lib/visible-interval";

let visibility: DocumentVisibilityState = "visible";
const setVisibility = (v: DocumentVisibilityState) => {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("setVisibleInterval", () => {
  it("polls while visible, stops while hidden, and catches up on return", () => {
    const tick = vi.fn();
    const stop = setVisibleInterval(tick, 1000);
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);

    setVisibility("hidden");
    vi.advanceTimersByTime(10_000);
    expect(tick).toHaveBeenCalledTimes(3);

    setVisibility("visible");
    expect(tick).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(5);

    stop();
    vi.advanceTimersByTime(5000);
    setVisibility("hidden");
    setVisibility("visible");
    expect(tick).toHaveBeenCalledTimes(5);
  });

  it("doesn't start in a tab that's hidden when it mounts", () => {
    visibility = "hidden";
    const tick = vi.fn();
    setVisibleInterval(tick, 1000);
    vi.advanceTimersByTime(5000);
    expect(tick).not.toHaveBeenCalled();
  });
});
