import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

// The real SidebarSkills does a DB round trip — irrelevant to what this
// file is responsible for (the static shell), and covered by its own
// tests. Stub it so this suite never needs a database.
vi.mock("@/app/dashboard/sidebar-skills", () => ({
  SidebarSkills: () => <div data-testid="sidebar-skills-stub" />,
  SidebarSkillsSkeleton: () => <div data-testid="sidebar-skills-skeleton" />,
}));

import { getSession } from "@/lib/session";
import DashboardLayout from "@/app/dashboard/layout";

// The layout also mounts NotificationBell and BookingToast, both of which
// fetch immediately on mount — flush that microtask so it isn't reported
// as an unwrapped act() warning.
async function renderLayout(children: React.ReactNode) {
  const element = await DashboardLayout({ children });
  await act(async () => {
    render(element);
    await Promise.resolve();
  });
}

describe("DashboardLayout", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("redirects to login when there's no authenticated session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    await expect(
      DashboardLayout({ children: <div /> })
    ).rejects.toThrow("NEXT_REDIRECT:/api/auth/login");
  });

  it("renders a Home link pointing at /home, above the SHOWTIME wordmark", async () => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1", email: "sarah@acme.com" } as any);
    await renderLayout(<div>page content</div>);

    const homeLink = screen.getByText("Home").closest("a")!;
    expect(homeLink).toHaveAttribute("href", "/home");

    // Structural check: Home must appear before SHOWTIME in the DOM order,
    // so it reads as "leave this app" rather than a fifth in-app nav item.
    const wordmark = screen.getByText("SHOWTIME");
    expect(
      homeLink.compareDocumentPosition(wordmark) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("uses a real full-navigation anchor for Home, not a client-side Link", async () => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1", email: "sarah@acme.com" } as any);
    await renderLayout(<div />);

    const homeLink = screen.getByText("Home").closest("a")!;
    // A Next <Link> renders as an <a> too, but only a plain anchor
    // guarantees a full page reload — the deliberate fix for cross-app
    // navigation race conditions. We can't distinguish them by tag alone,
    // but Next's Link always attaches a prefetch-related data attribute
    // in this repo's version; a plain anchor never does.
    expect(homeLink.hasAttribute("data-nextjs-router-prefetch")).toBe(false);
  });

  it("derives the display name from the session email", async () => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1", email: "priya@acme.com" } as any);
    await renderLayout(<div />);
    expect(screen.getByText("priya")).toBeInTheDocument();
  });

  it("falls back to 'Member' when the session has no email", async () => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
    await renderLayout(<div />);
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("renders the page content passed as children", async () => {
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1", email: "sarah@acme.com" } as any);
    await renderLayout(<div>UNIQUE_PAGE_MARKER</div>);
    expect(screen.getByText("UNIQUE_PAGE_MARKER")).toBeInTheDocument();
  });
});
