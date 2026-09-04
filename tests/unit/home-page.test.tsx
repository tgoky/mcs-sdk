import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/session";
import WorkspaceHomePage from "@/app/home/page";

async function renderHomePage() {
  const element = await WorkspaceHomePage();
  render(element);
}

describe("WorkspaceHomePage", () => {
  it("greets the user by the local part of their email", async () => {
    vi.mocked(getSession).mockResolvedValue({ email: "sarah@acme.com" } as any);
    await renderHomePage();
    expect(screen.getByText("Welcome back, sarah")).toBeInTheDocument();
  });

  it("falls back to a generic greeting when there's no email on the session", async () => {
    vi.mocked(getSession).mockResolvedValue({} as any);
    await renderHomePage();
    expect(screen.getByText("Welcome back, there")).toBeInTheDocument();
  });

  it("shows Showtime as available and links it to /dashboard", async () => {
    vi.mocked(getSession).mockResolvedValue({ email: "sarah@acme.com" } as any);
    await renderHomePage();

    const showtimeHeading = screen.getByRole("heading", { name: "Showtime" });
    const card = showtimeHeading.closest("a");
    expect(card).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("button", { name: /Open Showtime/ })).not.toBeDisabled();
  });

  it("shows Reputation Manager as available and links it to /dashboard/reputation-manager", async () => {
    vi.mocked(getSession).mockResolvedValue({ email: "sarah@acme.com" } as any);
    await renderHomePage();

    const heading = screen.getByRole("heading", { name: "Reputation Manager" });
    const card = heading.closest("a");
    expect(card).toHaveAttribute("href", "/dashboard/reputation-manager");
    expect(screen.getByRole("button", { name: /Open Reputation Manager/ })).not.toBeDisabled();
  });

  it("provides a sign-out link", async () => {
    vi.mocked(getSession).mockResolvedValue({ email: "sarah@acme.com" } as any);
    await renderHomePage();
    expect(screen.getByText("Sign out").closest("a")).toHaveAttribute("href", "/api/auth/logout");
  });

  it("never reintroduces the old animated/pulsing decorative elements", async () => {
    vi.mocked(getSession).mockResolvedValue({ email: "sarah@acme.com" } as any);
    const { container } = render(await WorkspaceHomePage());
    // Regression guard for the specific "looks AI-generated" complaint this
    // rewrite fixed: no pulsing status dots, no animated gradients.
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(container.querySelector('[class*="gradient"]')).toBeNull();
  });
});
