import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  getPrimaryEngagementIdForWorkspace: vi.fn(),
}));
vi.mock("@/lib/user-avatar", () => ({ getUserAvatar: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
const tourProps = vi.fn();
vi.mock("@/components/tours/tour-provider", () => ({
  TourProvider: (props: { children: React.ReactNode; operatorHasSeenTours?: boolean }) => {
    tourProps(props);
    return <>{props.children}</>;
  },
}));
vi.mock("@/components/tours/tour-overlay", () => ({ TourOverlay: () => null }));
vi.mock("@/components/shell-layout", () => ({
  ShellLayout: ({ children, displayName }: { children: React.ReactNode; displayName: string }) => (
    <div>
      <span data-testid="display-name">{displayName}</span>
      {children}
    </div>
  ),
}));
vi.mock("@/app/dashboard/work-sidebar", () => ({ WorkSidebar: () => null, WorkSidebarSkeleton: () => null }));
vi.mock("@/components/mobile-nav-pill", () => ({ MobileNavPill: () => null }));
vi.mock("@/app/dashboard/booking-toast", () => ({ BookingToast: () => null }));

import { getSession } from "@/lib/session";
import { getActiveWorkspace, listWorkspaces, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { getUserAvatar } from "@/lib/user-avatar";
import { db } from "@/lib/db";
import { fakeDb } from "../helpers/fake-db";
import DashboardLayout from "@/app/dashboard/layout";

describe("DashboardLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "u1", email: "sarah@acme.com" } as any);
    vi.mocked(getActiveWorkspace).mockResolvedValue({ workspaceId: "ws1", name: "Acme" } as any);
    vi.mocked(listWorkspaces).mockResolvedValue([{ workspaceId: "ws1", name: "Acme" }] as any);
    vi.mocked(getPrimaryEngagementIdForWorkspace).mockResolvedValue("e1");
    vi.mocked(getUserAvatar).mockResolvedValue({ avatarType: null, avatarStyle: null, avatarSeed: null, avatarImageUrl: null });
    Object.assign(db, fakeDb([]));
  });

  it("redirects to login when there's no authenticated session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow("NEXT_REDIRECT:/api/auth/login");
  });

  it("renders the page content and derives the display name from the email", async () => {
    render(await DashboardLayout({ children: <div>page content</div> }));
    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(screen.getByTestId("display-name")).toHaveTextContent("sarah");
  });

  it("falls back to 'Member' when the session has no email", async () => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "u1" } as any);
    render(await DashboardLayout({ children: <div /> }));
    expect(screen.getByTestId("display-name")).toHaveTextContent("Member");
  });

  it("skips the welcome nudge when any of the operator's clients has tour progress", async () => {
    Object.assign(db, fakeDb([{ id: "row-1", stack: { tour_state: { library: {} } } }]));
    render(await DashboardLayout({ children: <div /> }));
    expect(tourProps).toHaveBeenLastCalledWith(expect.objectContaining({ operatorHasSeenTours: true }));
  });

  it("shows the welcome nudge to an operator with no tour progress anywhere", async () => {
    render(await DashboardLayout({ children: <div /> }));
    expect(tourProps).toHaveBeenLastCalledWith(expect.objectContaining({ operatorHasSeenTours: false }));
  });
});
