import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ShowtimeSetupState, SetupValue } from "@/lib/showtime-setup/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/tours/tour-provider", () => ({ useTour: () => ({ start: vi.fn() }) }));

import { ShowtimeSetup, rebuildPlan } from "@/components/product-setup/showtime-setup";

const v = (value: string | null): SetupValue => ({ value, tier: "done", source: "saved", sourceDetail: null, evidence: null, confidence: null });

function state(configured: boolean): ShowtimeSetupState {
  return {
    engagementId: "e1",
    buyer: "Mudd1s",
    configured,
    skills: { "pin-down": true, "pile-on": true, "pre-call-read": true, "win-back": false, "leak-map": true },
    website: { domain: "muddventures.com", readAt: null, readDomain: null, siteCheck: null },
    offer: {
      operatorName: v(null),
      offerName: v("AI Clarity Call"),
      offerPrice: v("$500"),
      offerVertical: v(null),
      offerIcp: v("Business owners"),
      trafficTemperature: v("warm"),
      castingChoice: v("founder_on_camera"),
      heroVideoUrl: v(null),
    },
    platforms: { booking: v("calendly"), email: v(null), hosting: v("plain_html") },
    choices: { smsPlatform: v("none"), adDataPlatform: v("none"), briefLandingDestination: v("slack"), slackWebhookUrl: "" },
    picks: {},
    tools: [],
    whopPlanOptions: [],
    existingPage: { url: null, reuse: false },
    siteReading: { testimonials: [], faqs: [], objections: [], objectionsTier: "done", socialProfiles: {}, pagesRead: 0 },
    accountRead: {
      booking: null, deals: null, email: null, sender: null, prospectWords: [], brief: null, briefTier: "ask",
      salesCall: null, eventTypes: [], automations: [], team: [], leadSources: [], blocked: [],
    },
    preview: { designSignal: null, template: "contract", confirmationPageUrl: null },
    pinDown: {
      template: "goldenticket",
      animations: false,
      personalizedIntro: true,
      prospectMeets: "the founder",
      topCallQuestions: ["How long does it take?"],
      topObjections: [],
      brandVoice: "Plain and direct.",
      testimonials: [{ name: "Ada", role: "Founder", quote: "It paid for itself." }],
    },
  };
}

function mockFetch(configured: boolean) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/setup/showtime")) return new Response(JSON.stringify(state(configured)));
    return new Response(JSON.stringify({ ok: true }));
  }) as unknown as typeof fetch;
  return calls;
}

describe("Show Rate Setup settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows only Show Rate Setup's settings once Showtime is set up, not every skill and its switch", async () => {
    mockFetch(true);
    render(<ShowtimeSetup engagementId="e1" onCancel={() => {}} focus="pin-down" />);
    await screen.findByText("The offer");
    for (const heading of ["The page", "Scripts and briefs", "Tools"]) expect(screen.getByText(heading)).toBeInTheDocument();
    for (const label of ["Design", "Personal intro", "Animations", "Who runs the calls", "Prospects' questions", "Objections", "Testimonials", "Brand voice", "Price"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("The Golden Ticket")).toBeInTheDocument();
    // No other skill, and nothing about Call Brief's Slack webhook.
    expect(screen.queryByText("Pre-Call Sequence")).not.toBeInTheDocument();
    expect(screen.queryByText(/Switch any skill on or off/)).not.toBeInTheDocument();
    expect(screen.queryByText("The Slack webhook")).not.toBeInTheDocument();
  });

  it("saves without touching which skills are on, sends only the extras that changed, and rebuilds only the page", async () => {
    const calls = mockFetch(true);
    render(<ShowtimeSetup engagementId="e1" onCancel={() => {}} focus="pin-down" />);
    await screen.findByText("The offer");
    fireEvent.click(screen.getByRole("switch", { name: "Sections fade in as the page loads" }));
    // An animations change rebuilds the page and leaves the scripts alone.
    expect(screen.getByRole("switch", { name: "Rebuild and republish the confirmation page" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Rewrite the video scripts and ad briefs" })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/pin-down/run-piece"))).toBe(true));
    const patch = calls.find((c) => c.url.endsWith("/details"));
    expect(patch?.method).toBe("PATCH");
    expect(patch?.body).toEqual({ confirmationPageAnimationsEnabled: true });
    const post = calls.find((c) => c.url.endsWith("/bridges/pin-down"))!;
    expect(post.body).not.toHaveProperty("skills");
    expect(post.body).toMatchObject({ runPinDown: false });
    expect(calls.indexOf(patch!)).toBeLessThan(calls.indexOf(post));
    expect(calls.find((c) => c.url.endsWith("/pin-down/run-piece"))?.body).toEqual({ piece: "confirmation_page" });
    expect(calls.some((c) => c.url.includes("/regenerate/"))).toBe(false);
  });

  it("has one Save, off until something changes, and no filler hints", async () => {
    mockFetch(true);
    render(<ShowtimeSetup engagementId="e1" onCancel={() => {}} focus="pin-down" />);
    await screen.findByText("The offer");
    expect(screen.queryByRole("button", { name: "Save for now" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText(/Tap a logo/)).not.toBeInTheDocument();
    expect(screen.queryByText("What the page tells bookers.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Sections fade in as the page loads" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("rebuilds nothing when the person switches the rebuild off", async () => {
    const calls = mockFetch(true);
    render(<ShowtimeSetup engagementId="e1" onCancel={() => {}} focus="pin-down" />);
    await screen.findByText("The offer");
    fireEvent.click(screen.getByRole("switch", { name: "Sections fade in as the page loads" }));
    fireEvent.click(screen.getByRole("switch", { name: "Rebuild and republish the confirmation page" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/bridges/pin-down"))).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.some((c) => c.url.endsWith("/pin-down/run-piece") || c.url.includes("/regenerate/"))).toBe(false);
  });

  it("is still the full setup, switches and all, before Showtime has been set up", async () => {
    mockFetch(false);
    render(<ShowtimeSetup engagementId="e1" onCancel={() => {}} focus="pin-down" />);
    await screen.findByText("What should Showtime do?");
    expect(screen.queryByText("Scripts and briefs")).not.toBeInTheDocument();
  });
});

describe("rebuildPlan", () => {
  const plan = (...keys: string[]) => rebuildPlan(new Set(keys));
  it("runs Pin-Down in full only when a connection changed", () => {
    expect(plan("platform.hosting").full).toBe(true);
    expect(plan("pick.vercel_project_name").full).toBe(true);
    expect(plan("salesCall").full).toBe(true);
    expect(plan("offer.offerPrice", "extra.template").full).toBe(false);
  });
  it("rebuilds what each change feeds", () => {
    expect(plan("extra.template")).toEqual({ full: false, page: true, content: false });
    expect(plan("extra.topObjections")).toEqual({ full: false, page: false, content: true });
    expect(plan("offer.offerName")).toEqual({ full: false, page: true, content: true });
    expect(plan()).toEqual({ full: false, page: false, content: false });
  });
});
