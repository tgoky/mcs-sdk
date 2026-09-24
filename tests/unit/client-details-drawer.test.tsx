import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/dashboard/engagements/[id]/trigger-skill-button", () => ({ TriggerSkillButton: () => null }));

import { ClientDetailsDrawer } from "@/app/dashboard/engagements/[id]/client-details-drawer";

describe("client details drawer", () => {
  it("links to Show Rate Setup's settings and saves only its own fields", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    global.fetch = fetchMock as unknown as typeof fetch;
    render(
      <ClientDetailsDrawer
        data={{ engagementId: "e1", buyer: "Acme", queuePinWindowHours: 48, notificationPackSelections: ["show_rate_drop"] }}
        isOpen
        onClose={() => {}}
      />
    );
    expect(screen.getByRole("link", { name: /Open Show Rate Setup settings/ })).toHaveAttribute("href", "/dashboard/engagements/e1/skills/pin-down?configure=1");
    expect(screen.queryByText("Offer name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/engagements/e1/details");
    expect(JSON.parse(String(init.body))).toEqual({ queuePinWindowHours: 48, notificationPackSelections: ["show_rate_drop"] });
  });
});
