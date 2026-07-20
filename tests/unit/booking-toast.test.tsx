import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BookingToast } from "@/app/dashboard/booking-toast";

function apiRun(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "run-1",
    skillName: "pile-on",
    status: "success",
    phase: null,
    startedAt: new Date().toISOString(),
    engagementId: "eng-1",
    buyerName: "Priya Patel",
    subjectLabel: "Priya Patel <priya@example.com>",
    ...overrides,
  };
}

function mockFetchSequence(...responses: unknown[][]) {
  const fn = vi.fn();
  responses.forEach((runs) => {
    fn.mockResolvedValueOnce({ ok: true, json: async () => ({ runs }) });
  });
  fn.mockResolvedValue({ ok: true, json: async () => ({ runs: responses.at(-1) ?? [] }) });
  return fn;
}

describe("BookingToast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not toast for runs that already existed before mount (baseline poll)", async () => {
    global.fetch = mockFetchSequence([apiRun()]);
    await act(async () => {
      render(<BookingToast />);
      await Promise.resolve();
    });
    expect(screen.queryByText("New booking just landed")).not.toBeInTheDocument();
  });

  it("toasts a genuinely new pile-on run that appears after the baseline poll", async () => {
    global.fetch = mockFetchSequence(
      [], // baseline: nothing yet
      [apiRun({ id: "run-2", buyerName: "New Prospect Co" })]
    );

    render(<BookingToast />);
    await act(async () => {
      await Promise.resolve(); // baseline poll (immediate on-mount)
    });
    expect(screen.queryByText("New booking just landed")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5000); // second poll picks up the new run
      await Promise.resolve();
    });

    expect(screen.getByText("New booking just landed")).toBeInTheDocument();
    expect(screen.getByText("New Prospect Co")).toBeInTheDocument();
  });

  it("toasts a win-back rebooking distinctly from a fresh booking", async () => {
    global.fetch = mockFetchSequence(
      [],
      [
        {
          ...apiRun({ id: "run-3", skillName: "win-back", buyerName: "Returning Client" }),
          phase: "webhook_received",
        },
      ]
    );

    render(<BookingToast />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(screen.getByText("Prospect rebooked")).toBeInTheDocument();
  });

  it("dismisses a toast when its close button is clicked", async () => {
    global.fetch = mockFetchSequence([], [apiRun({ id: "run-4" })]);
    render(<BookingToast />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    const toast = screen.getByText("New booking just landed").closest("button")!;
    const dismissBtn = toast.querySelector("span")!;
    fireEvent.click(dismissBtn);
    expect(screen.queryByText("New booking just landed")).not.toBeInTheDocument();
  });

  it("auto-dismisses a toast after its lifetime elapses", async () => {
    global.fetch = mockFetchSequence([], [apiRun({ id: "run-5" })]);
    render(<BookingToast />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(screen.getByText("New booking just landed")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(8000); // TOAST_LIFETIME_MS
    });
    expect(screen.queryByText("New booking just landed")).not.toBeInTheDocument();
  });

  it("caps the visible stack at 4 toasts", async () => {
    const newRuns = Array.from({ length: 6 }, (_, i) =>
      apiRun({ id: `run-batch-${i}`, buyerName: `Client ${i}` })
    );
    global.fetch = mockFetchSequence([], newRuns);

    render(<BookingToast />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(screen.getAllByText("New booking just landed")).toHaveLength(4);
  });

  it("stops polling and never updates state after unmount", async () => {
    const fetchMock = mockFetchSequence([], []);
    global.fetch = fetchMock;

    const { unmount } = render(<BookingToast />);
    await act(async () => {
      await Promise.resolve();
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    unmount();
    fetchMock.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const stateUpdateWarnings = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes("unmounted component")
    );
    expect(stateUpdateWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });
});
