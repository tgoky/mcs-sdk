import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { coldOpenState } from "./fixtures/setup-states";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard" }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { ColdOpenSetup } from "@/components/product-setup/cold-open-setup";

const state = coldOpenState;

function mockFetch() {
  global.fetch = vi.fn(async () => new Response(JSON.stringify(state))) as unknown as typeof fetch;
}

describe("Cold Open review", () => {
  it("shows the campaign, what we did and what's left, with no form on the page", async () => {
    mockFetch();
    render(<ColdOpenSetup engagementId="e1" onCancel={() => {}} />);
    await screen.findByText("What we did");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("AI Clarity Call to Agency owners");
    expect(screen.getByText("Not sending yet")).toBeInTheDocument();
    expect(screen.getByText(/Your offer is/)).toHaveTextContent("Your offer is AI Clarity Call at $500");
    expect(screen.getByText(/Writing to/)).toHaveTextContent("Writing to Agency owners");
    expect(screen.getAllByText("From your Showtime setup")).toHaveLength(2);
    expect(screen.getByText("Connect your sending tool")).toBeInTheDocument();
    expect(screen.getByText("Add a lead list")).toBeInTheDocument();
    // Nothing to type until someone taps Change.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("changes a finding in a small editor, and Undo puts back what we found", async () => {
    mockFetch();
    render(<ColdOpenSetup engagementId="e1" onCancel={() => {}} />);
    await screen.findByText("What we did");
    const row = screen.getByText(/Emails open with/).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Change" }));
    const card = await screen.findByRole("dialog", { name: "Change" });
    fireEvent.change(within(card).getByPlaceholderText("Plain and friendly"), { target: { value: "Direct" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(/Emails open with/)).toHaveTextContent("sound direct"));
    fireEvent.click(within(screen.getByText(/Emails open with/).closest("li")!).getByRole("button", { name: "Undo" }));
    expect(screen.getByText(/Emails open with/)).toHaveTextContent("sound plain and friendly");
  });
});
