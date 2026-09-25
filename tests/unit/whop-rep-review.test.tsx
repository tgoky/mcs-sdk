import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { repState, whopState } from "./fixtures/setup-states";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard" }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { WhopSetup } from "@/components/product-setup/whop-setup";
import { RepSetup } from "@/components/product-setup/rep-setup";

const whop = whopState;
const rep = repState;

/** The feed line whose whole text matches, bold parts and all. */
const line = (re: RegExp) => screen.getByText((_, el) => el?.tagName === "P" && re.test(el.textContent ?? ""));
const noLine = (re: RegExp) => screen.queryByText((_, el) => el?.tagName === "P" && re.test(el.textContent ?? ""));

function mockFetch(state: unknown) {
  const calls: { url: string; body: unknown }[] = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/setup/whop") || url.endsWith("/setup/rep")) return new Response(JSON.stringify(state));
    return new Response(JSON.stringify({ ok: true }));
  }) as unknown as typeof fetch;
  return calls;
}

describe("Whop Agent review", () => {
  it("shows what was read and what's left, with no form on the page", async () => {
    mockFetch(whop);
    render(<WhopSetup engagementId="e1" onCancel={() => {}} />);
    await screen.findByText("What we did");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mudd1s on Whop");
    expect(screen.getByText("$5,880")).toBeInTheDocument();
    expect(line(/Read 1 plan/)).toHaveTextContent("The biggest is Pro with 120 members at $49/mo.");
    expect(line(/set to cancel,/)).toHaveTextContent("most often saying");
    expect(line(/Warn you when/)).toHaveTextContent("refunds pass 8% of payments, disputes pass 0.75%");
    // The save offer is never guessed: it's left to do, and optional.
    expect(screen.getByText(/Choose a save offer/)).toBeInTheDocument();
    expect(noLine(/Save offer:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("sets a save offer in the small editor and sends it on Approve", async () => {
    const calls = mockFetch(whop);
    render(<WhopSetup engagementId="e1" onCancel={() => {}} />);
    await screen.findByText("What we did");
    const todo = screen.getByText(/Choose a save offer/).closest("li")!;
    fireEvent.click(within(todo).getByRole("button", { name: "Add" }));
    const card = await screen.findByRole("dialog", { name: "Save offer" });
    fireEvent.change(within(card).getByLabelText("Discount percent"), { target: { value: "30" } });
    // Half an offer holds up Approve.
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    fireEvent.change(within(card).getByLabelText("Months"), { target: { value: "2" } });
    fireEvent.change(within(card).getByLabelText("Message"), { target: { value: "Stay for {discount} off" } });
    // Still open once the offer is whole: the row doesn't jump away mid-edit.
    expect(card).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Save offer" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Save offer:/)).toHaveTextContent("Save offer: 30% off for 2 months"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/setup/whop/save"))).toBe(true));
    const body = calls.find((c) => c.url.endsWith("/setup/whop/save"))!.body as { saveOffer: unknown; alerts: unknown };
    expect(body.saveOffer).toMatchObject({ discount: "30", months: "2", message: "Stay for {discount} off" });
    expect(body.alerts).toEqual({ refundRate: 0.08, disputeRate: 0.0075, alertThreshold: 3, minSample: 20 });
  });
});

describe("Reputation Manager review", () => {
  const configured = { ...rep, configured: true, skills: { "rep-engine-panel": true, "rep-crisis-response": true } };

  it("shows every name as chips in the feed, and never pre-fills the crisis contact", async () => {
    mockFetch(configured);
    render(<RepSetup engagementId="e1" onCancel={() => {}} />);
    await screen.findByText("What we watch");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mudd Ventures");
    expect(line(/Watching for/)).toHaveTextContent("Watching for Mudd Ventures, from muddventures.com.");
    for (const chip of ["Mudd", "muddventures.com", "hi@muddventures.com", "AI Clarity Call", "Acme", "Is Mudd Ventures legit?"]) expect(screen.getByRole("button", { name: chip })).toBeInTheDocument();
    // A handle chip carries its platform's icon, so its name is more than the handle.
    expect(screen.getByRole("button", { name: /@mudd$/ })).toBeInTheDocument();
    expect(screen.getByText(/Choose who's paged when something's serious/)).toBeInTheDocument();
    expect(screen.queryByText(/Ada Mudd/)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("switches a chip off in place and saves the same body once someone is chosen", async () => {
    const calls = mockFetch(configured);
    render(<RepSetup engagementId="e1" onCancel={() => {}} />);
    await screen.findByText("What we watch");
    fireEvent.click(screen.getByRole("button", { name: "Acme" }));
    const todo = screen.getByText(/Choose who's paged when something's serious/).closest("li")!;
    fireEvent.click(within(todo).getByRole("button", { name: "Choose" }));
    const card = await screen.findByRole("dialog", { name: "Who's paged" });
    // The site's founder is one tap, not a pre-fill.
    fireEvent.click(within(card).getByRole("button", { name: "Use Ada Mudd, Founder" }));
    fireEvent.click(within(card).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled());
    expect(screen.getByText(/is paged when/)).toHaveTextContent("Ada Mudd is paged when something's serious");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/bridges/rep-onboarding"))).toBe(true));
    const body = calls.find((c) => c.url.endsWith("/bridges/rep-onboarding"))!.body as Record<string, unknown>;
    expect(body.soleAuthorityName).toBe("Ada Mudd");
    expect(body.competitors).toEqual([]);
    expect(body.operatorAliases).toEqual(["Mudd"]);
    expect(body.operatorHandles).toEqual({ x: "@mudd" });
  });
});
