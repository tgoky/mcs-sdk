import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationList } from "@/app/dashboard/notification-bell";
import type { NotificationRow } from "@/app/dashboard/use-notifications";

// The standalone NotificationBell component was replaced by the right
// utility panel; NotificationList is what it renders.

function row(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n1",
    type: "run_failed",
    severity: "critical",
    title: "Pin-Down failed",
    body: "The booking tool rejected the key.",
    read: false,
    createdAt: new Date().toISOString(),
    runId: null,
    engagementId: null,
    ...overrides,
  } as NotificationRow;
}

describe("NotificationList", () => {
  it("shows an empty state when there's nothing", () => {
    render(<NotificationList notifs={[]} unreadCount={0} markAllRead={vi.fn()} markRead={vi.fn()} />);
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
    expect(screen.queryByText("[ Mark all read ]")).not.toBeInTheDocument();
  });

  it("lists notifications and marks all read", () => {
    const markAllRead = vi.fn();
    render(<NotificationList notifs={[row()]} unreadCount={1} markAllRead={markAllRead} markRead={vi.fn()} />);
    expect(screen.getByText("Pin-Down failed")).toBeInTheDocument();
    fireEvent.click(screen.getByText("[ Mark all read ]"));
    expect(markAllRead).toHaveBeenCalled();
  });

  it("marks one read when it's opened, and links to its run", () => {
    const markRead = vi.fn();
    render(<NotificationList notifs={[row({ runId: "run-9" })]} unreadCount={1} markAllRead={vi.fn()} markRead={markRead} />);
    const link = screen.getByText("Pin-Down failed").closest("a")!;
    expect(link).toHaveAttribute("href", "/dashboard/runs/run-9");
    fireEvent.click(link);
    expect(markRead).toHaveBeenCalledWith("n1");
  });

  it("doesn't mark an already-read notification again", () => {
    const markRead = vi.fn();
    render(<NotificationList notifs={[row({ read: true })]} unreadCount={0} markAllRead={vi.fn()} markRead={markRead} />);
    fireEvent.click(screen.getByText("Pin-Down failed"));
    expect(markRead).not.toHaveBeenCalled();
  });
});
