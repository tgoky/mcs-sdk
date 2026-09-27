import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard" }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/breadcrumbs/breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("@/components/global-search", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/right-utility-rail", () => ({ RightUtilityRail: () => null }));
vi.mock("@/components/tours/tour-launcher", () => ({ TourLauncher: () => null }));

import { TopNav, type CreateMenuContext } from "@/components/top-nav";

const ctx: CreateMenuContext = {
  engagementId: "e1",
  skills: [
    { id: "pile-on", name: "Pre-Call Sequence", hasSettings: true },
    { id: "rep-digest", name: "Daily Digest", hasSettings: false },
  ],
  products: [{ id: "showtime", name: "Showtime", setupSkillId: "pin-down" }],
};

describe("the Create menu", () => {
  it("offers ten working shortcuts, and runs a skill from its list", async () => {
    const calls: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    render(<TopNav onToggleSidebar={() => {}} activePanel={null} onSelectPanel={() => {}} unreadNotifications={0} createMenu={ctx} />);
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    const labels = [
      "New client",
      "Copy a results link",
      "Open the client report",
      "Run a skill now",
      "Change a skill's settings",
      "Turn on a skill",
      "Open a product's setup",
      "Review the queue",
      "Connect a tool",
      "Ask a teammate",
    ];
    for (const l of labels) expect(screen.getByText(l)).toBeInTheDocument();
    // None of the old links to pages that ignored them.
    expect(document.querySelector('a[href*="action="]')).toBeNull();

    fireEvent.click(screen.getByText("Change a skill's settings"));
    expect(screen.getByText("Pre-Call Sequence")).toBeInTheDocument();
    expect(screen.queryByText("Daily Digest")).toBeNull();
    fireEvent.click(screen.getByText("Change a skill's settings"));

    fireEvent.click(screen.getByText("Run a skill now"));
    fireEvent.click(screen.getByText("Daily Digest"));
    await waitFor(() => expect(calls).toEqual([{ url: "/api/skill-runs/trigger", body: { engagementId: "e1", skillName: "rep-digest" } }]));
  });

  it("points a product's setup at its setup page", () => {
    render(<TopNav onToggleSidebar={() => {}} activePanel={null} onSelectPanel={() => {}} unreadNotifications={0} createMenu={ctx} />);
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    fireEvent.click(screen.getByText("Open a product's setup"));
    expect(screen.getByRole("link", { name: /Showtime/ })).toHaveAttribute("href", "/dashboard/engagements/e1/bridges/pin-down");
  });
});
