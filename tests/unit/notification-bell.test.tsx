import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NotificationBell } from "@/app/dashboard/notification-bell";

function notif(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "notif-1",
    type: "run_failed",
    severity: "critical" as const,
    title: "A run failed",
    body: "Pin-Down failed for Acme Co.",
    runId: "run-1",
    engagementId: "eng-1",
    read: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("loads notifications on mount and shows the unread badge", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [notif()], unreadCount: 1 }),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<NotificationBell />);
      await Promise.resolve();
    });

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("caps the visible badge at '9+' for large unread counts", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 25 }),
    }) as unknown as typeof fetch;
    await act(async () => {
      render(<NotificationBell />);
      await Promise.resolve();
    });
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("shows no badge and an empty-state message when there's nothing unread", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    }) as unknown as typeof fetch;
    await act(async () => {
      render(<NotificationBell />);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
  });

  it("opens the dropdown, shows the list, and marks all read", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [notif()], unreadCount: 1 }),
    }) as unknown as typeof fetch;
    await act(async () => {
      render(<NotificationBell />);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText("A run failed")).toBeInTheDocument();

    const markAllFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = markAllFetch as unknown as typeof fetch;

    await act(async () => {
      fireEvent.click(screen.getByText("[ Mark all read ]"));
      await Promise.resolve();
    }) as unknown as typeof fetch;

    expect(markAllFetch).toHaveBeenCalledWith("/api/notifications/all/read", { method: "POST" });
    // Unread badge should be gone (optimistic update happened immediately,
    // not waiting on the network round trip).
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("closes the dropdown on an outside click", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    }) as unknown as typeof fetch;
    await act(async () => {
      render(<NotificationBell />);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText(/Nothing yet/)).not.toBeInTheDocument();
  });

  it("polls again after 30s, and stops polling once unmounted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { unmount } = render(<NotificationBell />);
    await act(async () => {
      await Promise.resolve();
    });
    fetchMock.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    unmount();
    fetchMock.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const stateUpdateWarnings = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes("unmounted component")
    );
    expect(stateUpdateWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("never throws when the API call fails — polling degrades silently", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    await expect(
      act(async () => {
        render(<NotificationBell />);
        await Promise.resolve();
      })
    ).resolves.not.toThrow();
    // Bell renders with no badge rather than crashing the dashboard shell.
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });
});
