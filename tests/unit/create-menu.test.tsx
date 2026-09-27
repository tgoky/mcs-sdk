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
    { id: "pin-down", name: "Show Rate Setup", hasSettings: true },
    { id: "pile-on", name: "Pre-Call Sequence", hasSettings: true },
    { id: "rep-digest", name: "Daily Digest", hasSettings: false },
  ],
  products: [{ id: "showtime", name: "Showtime", setupSkillId: "pin-down" }],
};

describe("the Create menu", () => {
  it("offers the approved shortcuts, and runs a skill from its list", async () => {
    const calls: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    render(<TopNav onToggleSidebar={() => {}} activePanel={null} onSelectPanel={() => {}} unreadNotifications={0} createMenu={ctx} />);
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    const labels = [
      "New workspace",
      "Run a skill now",
      "Change a skill's settings",
      "Open a product's setup",
      "Edit client details",
      "Copy a results link",
      "Pause this client",
      "Rebuild the confirmation page",
      "Ask a teammate",
    ];
    for (const l of labels) expect(screen.getByText(l)).toBeInTheDocument();
    // What the sidebar already reaches in one click isn't repeated here.
    for (const l of ["New client", "Open the client report", "Review the queue", "Turn on a skill"]) expect(screen.queryByText(l)).toBeNull();
    // Cold Open items only show when its skills are switched on for this client.
    expect(screen.queryByText("Add a lead list")).toBeNull();
    expect(screen.queryByText("Approve held Cold Open leads")).toBeNull();
    expect(screen.getByRole("link", { name: "New workspace" })).toHaveAttribute("href", "/home/new");
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

  it("offers Cold Open's shortcuts when Cold Open is on", () => {
    render(
      <TopNav
        onToggleSidebar={() => {}}
        activePanel={null}
        onSelectPanel={() => {}}
        unreadNotifications={0}
        createMenu={{ ...ctx, skills: [{ id: "daily-send", name: "Daily Send", hasSettings: true }, { id: "source-connect", name: "Source Connect", hasSettings: true }], products: [{ id: "cold-open", name: "Cold Open", setupSkillId: "icp-lock" }] }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    expect(screen.getByRole("link", { name: "Approve held Cold Open leads" })).toHaveAttribute("href", "/dashboard/engagements/e1/bridges/daily-send");
    expect(screen.getByText("Add a lead list")).toBeInTheDocument();
    expect(screen.queryByText("Rebuild the confirmation page")).toBeNull();
  });

  it("hides Cold Open's shortcuts when the package is installed but none of its skills are on", () => {
    render(
      <TopNav
        onToggleSidebar={() => {}}
        activePanel={null}
        onSelectPanel={() => {}}
        unreadNotifications={0}
        createMenu={{ ...ctx, products: [...ctx.products, { id: "cold-open", name: "Cold Open", setupSkillId: "icp-lock" }] }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    expect(screen.queryByText("Add a lead list")).toBeNull();
    expect(screen.queryByText("Approve held Cold Open leads")).toBeNull();
  });

  it("pauses the client, or resumes it when it's paused", async () => {
    const calls: { url: string; method?: string }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const { unmount } = render(<TopNav onToggleSidebar={() => {}} activePanel={null} onSelectPanel={() => {}} unreadNotifications={0} createMenu={ctx} />);
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    fireEvent.click(screen.getByText("Pause this client"));
    await waitFor(() => expect(calls).toEqual([{ url: "/api/engagements/e1/pause", method: "POST" }]));
    unmount();
    render(<TopNav onToggleSidebar={() => {}} activePanel={null} onSelectPanel={() => {}} unreadNotifications={0} createMenu={{ ...ctx, paused: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    fireEvent.click(screen.getByText("Resume this client"));
    await waitFor(() => expect(calls[1]).toEqual({ url: "/api/engagements/e1/pause", method: "DELETE" }));
  });

  it("points a product's setup at its setup page", () => {
    render(<TopNav onToggleSidebar={() => {}} activePanel={null} onSelectPanel={() => {}} unreadNotifications={0} createMenu={ctx} />);
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    fireEvent.click(screen.getByText("Open a product's setup"));
    expect(screen.getByRole("menuitem", { name: /Showtime/ })).toHaveAttribute("href", "/dashboard/engagements/e1/bridges/pin-down");
  });
});
