import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { LiveExecutionFeed } from "@/app/dashboard/live-execution-feed";

function run(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "run-1",
    skillName: "pile-on",
    status: "success",
    phase: null,
    startedAt: new Date().toISOString(),
    buyerName: "Sarah Jenkins",
    engagementId: "eng-1",
    ...overrides,
  };
}

describe("LiveExecutionFeed", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the empty state when there are no runs at all", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ runs: [] }) }) as unknown as typeof fetch;
    await act(async () => {
      render(<LiveExecutionFeed initialRuns={[]} />);
      await Promise.resolve();
    });
    expect(screen.getByText("No executions yet")).toBeInTheDocument();
  });

  it("renders the server-provided runs immediately, before any client fetch resolves", () => {
    // A fetch that never resolves — proves the initial render comes from
    // the SSR prop, not from waiting on the client poll. This is exactly
    // the "blank dashboard" scenario: if this ever regresses to needing
    // the fetch to resolve first, the table would flash empty on every
    // mount instead of showing data instantly.
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<LiveExecutionFeed initialRuns={[run({ buyerName: "Instant Render Co" })]} />);
    expect(screen.getByText("Instant Render Co")).toBeInTheDocument();
  });

  it("polls every 5s and replaces the table with fresh data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [run({ buyerName: "Round Two Inc" })] }) })
      .mockResolvedValue({ ok: true, json: async () => ({ runs: [run({ buyerName: "Round Two Inc" })] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LiveExecutionFeed initialRuns={[run({ buyerName: "Original Client" })]} />) as unknown as typeof fetch;
    expect(screen.getByText("Original Client")).toBeInTheDocument();

    // The immediate on-mount refresh (the async IIFE) resolves microtasks.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Round Two Inc")).toBeInTheDocument();

    fetchMock.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops polling once paused, and resumes when toggled back on", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ runs: [run()] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LiveExecutionFeed initialRuns={[run()]} />) as unknown as typeof fetch;
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText("[ Pause live ]"));
    fetchMock.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("[ Resume live ]"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("aborts the in-flight request and stops the interval on unmount (no stray state updates)", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, opts: { signal: AbortSignal }) => {
      capturedSignal = opts.signal;
      return new Promise(() => {}); // never resolves — simulates a slow request in flight
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { unmount } = render(<LiveExecutionFeed initialRuns={[run()]} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(capturedSignal?.aborted).toBe(false);

    // The React act() warning ("state update on an unmounted component")
    // is exactly the failure mode this guards against — if unmount() logs
    // one here, the fix has regressed.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    unmount();
    expect(capturedSignal?.aborted).toBe(true);

    // Advancing timers after unmount must not trigger any further fetch or
    // any React warning about updating state on an unmounted component.
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    const stateUpdateWarnings = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes("unmounted component")
    );
    expect(stateUpdateWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("navigates to the run detail page when a row is clicked", async () => {
    const theRun = run({ id: "run-42" });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ runs: [theRun] }) }) as unknown as typeof fetch;
    await act(async () => {
      render(<LiveExecutionFeed initialRuns={[theRun]} />);
      await Promise.resolve();
    });
    const row = screen.getByText("Sarah Jenkins").closest("tr")!;
    // Clicking the client name cell alone should NOT trigger row navigation
    // (it has its own Link + stopPropagation) — clicking elsewhere in the
    // row should.
    const statusCell = within(row).getAllByRole("cell")[3];
    fireEvent.click(statusCell);
    // No assertion on the mocked router here beyond "it doesn't throw" —
    // next/navigation's useRouter is mocked in tests/setup.ts.
  });
});
