import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { ConfirmationPageBody, confirmationPageSummary, type ConfirmationPageState } from "@/app/dashboard/engagements/[id]/confirmation-page-row";

const base: ConfirmationPageState = { url: null, deployment: null, pasteReadyHtml: null, pasteReadyInstructions: null };

describe("the Show Rate Setup confirmation page row", () => {
  it("leads with the live page and where it's hosted", () => {
    const page: ConfirmationPageState = {
      ...base,
      url: "https://acme.com/booked",
      deployment: { mode: "live", deployedVia: "webflow", lastAttemptedAt: "2026-09-20T10:00:00Z" },
    };
    expect(confirmationPageSummary(page)).toBe("Live on Webflow");
    render(<ConfirmationPageBody engagementId="e1" page={page} />);
    expect(screen.getByRole("link", { name: /acme\.com\/booked/ })).toHaveAttribute("href", "https://acme.com/booked");
    expect(screen.getByText(/Last published/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rebuild the page" })).toBeInTheDocument();
  });

  it("says why it wasn't published and hands over the HTML to paste", () => {
    const page: ConfirmationPageState = {
      url: "https://app.example.com/confirm/e1",
      deployment: { mode: "paste_ready", reason: "GoHighLevel has no publish API", lastAttemptedAt: "2026-09-20T10:00:00Z" },
      pasteReadyHtml: "<html>page</html>",
      pasteReadyInstructions: "Paste this into a new GoHighLevel page.",
    };
    expect(confirmationPageSummary(page)).toMatch(/Paste it into the site/);
    render(<ConfirmationPageBody engagementId="e1" page={page} />);
    expect(screen.getByText(/GoHighLevel has no publish API/)).toBeInTheDocument();
    expect(screen.getByLabelText("Page HTML")).toHaveValue("<html>page</html>");
  });

  it("builds a page that doesn't exist yet", async () => {
    const calls: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ runId: "run-9" }));
    }) as unknown as typeof fetch;
    expect(confirmationPageSummary(base)).toBe("Not built yet");
    render(<ConfirmationPageBody engagementId="e1" page={base} />);
    fireEvent.click(screen.getByRole("button", { name: "Build the page" }));
    await waitFor(() => expect(screen.getByRole("link", { name: /Follow the run/ })).toHaveAttribute("href", "/dashboard/runs/run-9"));
    expect(calls[0]).toEqual({ url: "/api/engagements/e1/pin-down/run-piece", body: { piece: "confirmation_page" } });
  });
});
