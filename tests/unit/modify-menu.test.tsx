import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/app/dashboard/engagements/[id]/approval-mode/approval-mode-toggle", () => ({ ApprovalModeToggle: () => <div>approval toggle</div> }));

import { EngagementActionsMenu } from "@/app/dashboard/engagements/[id]/engagement-actions-menu";

describe("the Modify menu", () => {
  it("holds only what belongs to the client as a whole", () => {
    render(
      <EngagementActionsMenu
        engagementId="e1"
        buyerName="Acme"
        initialStack={null}
        bookingPlatform="calendly"
        vaultLinksByProvider={{}}
        initialRequireApproval={false}
        initialDeletedAt={null}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Modify settings for Acme" }));
    expect(screen.getByText("approval toggle")).toBeInTheDocument();
    for (const l of ["Pause everything", "Edit client details", "Share results link", "Delete client"]) expect(screen.getByText(l)).toBeInTheDocument();
    expect(screen.getByText("Name, website, time zone, Queue pinning")).toBeInTheDocument();
    for (const l of ["Call intelligence", "Edit stack settings", "Update credentials"]) expect(screen.queryByText(l)).toBeNull();
  });

  it("offers Resume when the client is paused", () => {
    render(
      <EngagementActionsMenu engagementId="e1" buyerName="Acme" initialStack={null} vaultLinksByProvider={{}} initialRequireApproval={false} initialDeletedAt={null} initialPausedAt="2026-09-01T00:00:00Z" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Modify settings for Acme" }));
    expect(screen.getByText("Resume everything")).toBeInTheDocument();
  });
});
