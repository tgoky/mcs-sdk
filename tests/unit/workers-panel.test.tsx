import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard/engagements/e1", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { WorkersPanel, type ModuleRunDTO } from "@/app/dashboard/engagements/[id]/workers-panel";

const run = (status: string, extra: Partial<ModuleRunDTO> = {}): ModuleRunDTO => ({
  id: `run-${status}`,
  skillName: "x",
  status,
  phase: null,
  errorMessage: null,
  startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  completedAt: null,
  stepCount: 1,
  ...extra,
});

describe("the client page's skills", () => {
  it("lists one row per skill under its product, saying how each is doing and when it last ran", () => {
    render(
      <WorkersPanel
        engagementId="e1"
        workerIds={["pin-down", "win-back", "leak-map", "whop-connect"]}
        initialStates={{ "pin-down": true, "win-back": true, "leak-map": false, "whop-connect": true }}
        runsByWorker={{ "pin-down": [run("success")], "win-back": [run("failed", { errorMessage: "HubSpot 401" })] }}
        missingFieldsByWorkerId={{ "whop-connect": [{ key: "apiKey", label: "Whop API key", reason: "" }] }}
      />
    );
    expect(screen.getByRole("heading", { name: "Showtime" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Whop Agent" })).toBeInTheDocument();
    // No cards: rows in a list.
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(4);

    const winBack = rows.find((r) => within(r).queryByText("Booking Recovery"))!;
    expect(within(winBack).getByText("Failed")).toBeInTheDocument();
    expect(within(winBack).getByText("HubSpot 401")).toBeInTheDocument();
    expect(within(winBack).getByRole("link", { name: "2 hours ago" })).toHaveAttribute("href", "/dashboard/runs/run-failed");

    const whop = rows.find((r) => within(r).queryByText("Connect Whop Account"))!;
    expect(within(whop).getByText("Needs setup")).toBeInTheDocument();
    expect(within(whop).getByText("Missing: Whop API key")).toBeInTheDocument();

    expect(screen.getByRole("switch", { name: /Funnel Audit off/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: /Show Rate Setup on/ })).toHaveAttribute("aria-checked", "true");
  });
});
