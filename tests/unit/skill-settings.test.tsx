import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard" }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { ColdOpenSetup } from "@/components/product-setup/cold-open-setup";
import { RepSetup } from "@/components/product-setup/rep-setup";
import { WhopSetup } from "@/components/product-setup/whop-setup";
import { coldOpenState, repState, whopState } from "./fixtures/setup-states";

type Call = { url: string; method: string; body: unknown };

function mockFetch(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const hit = Object.keys(routes).find((k) => url.endsWith(k));
    return new Response(JSON.stringify(hit && (init?.method ?? "GET") === "GET" ? routes[hit] : { ok: true }));
  }) as unknown as typeof fetch;
  return calls;
}

const line = (re: RegExp) => screen.getByText((_, el) => el?.tagName === "P" && re.test(el.textContent ?? ""));

describe("a Cold Open skill's own settings", () => {
  it("shows only Voice Capture's rows, and saves them without touching skills or starting a run", async () => {
    const calls = mockFetch({ "/setup/cold-open": coldOpenState });
    const onSaved = vi.fn();
    render(<ColdOpenSetup engagementId="e1" onCancel={() => {}} onSaved={onSaved} focus="voice-capture" />);
    await screen.findByText("Settings for Mudd1s");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Voice Capture");
    expect(line(/Emails open with/)).toBeInTheDocument();
    expect(line(/No subject lines of your own/)).toBeInTheDocument();
    // Not the whole Cold Open: no campaign card, buyers, schedule or checklist.
    expect(screen.queryByText("What we did")).not.toBeInTheDocument();
    expect(screen.queryByText(/Writing to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/new leads a day/)).not.toBeInTheDocument();
    expect(screen.queryByText("Connect your sending tool")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "+ Add a subject line" }));
    const input = screen.getByPlaceholderText("Add a subject line");
    fireEvent.change(input, { target: { value: "Quick question" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Quick question" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({}));
    const post = calls.find((c) => c.url.endsWith("/setup/cold-open/save"))!;
    expect(post.body).toMatchObject({ settings: true, subjects: ["Quick question"] });
  });

  it("switches live sending only by its own explicit step, and shows held leads to approve", async () => {
    const calls = mockFetch({
      "/setup/cold-open": coldOpenState,
      "/held-leads": { leads: [{ id: "l1", email: "jane@acme.com", companyName: "Acme", firstName: "Jane", lastName: "Doe", statusDetail: { copy: { subject: "Hi Jane" } } }] },
    });
    render(<ColdOpenSetup engagementId="e1" onCancel={() => {}} focus="daily-send" />);
    await screen.findByText("Settings for Mudd1s");
    expect(line(/new leads a day/)).toBeInTheDocument();
    expect(line(/Live sending is off/)).toBeInTheDocument();
    expect(await screen.findByText(/is held for your review/)).toHaveTextContent("Jane Doe at Acme is held for your review");

    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    const card = await screen.findByRole("dialog", { name: "Turn on" });
    expect(card).toHaveTextContent("Real emails go out from the next run, up to 20 a day.");
    fireEvent.click(within(card).getByRole("button", { name: "Turn on live sending" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/bridges/daily-send") && c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/bridges/daily-send"))!.body).toEqual({ volume: 20, localHour: 9, copyMode: "generate", liveSendEnabled: true });

    fireEvent.click(screen.getByRole("button", { name: "Approve and send" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/held-leads") && c.method === "POST")?.body).toEqual({ leadId: "l1", action: "approve" }));
  });

  it("adds a group's lead list from a CSV, matching the columns itself", async () => {
    const calls = mockFetch({ "/setup/cold-open": coldOpenState, "/bridges/source-connect": { leadSources: [], icps: [], defaultFetcherType: "csv" } });
    render(<ColdOpenSetup engagementId="e1" onCancel={() => {}} focus="source-connect" />);
    const row = (await screen.findByText(/No leads for/)).closest("li")!;
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Add" }));
    const card = await screen.findByRole("dialog", { name: "Add" });
    const csv = "Work Email,Company Name,First Name,Last Name\njane@acme.com,Acme,Jane,Doe\nsam@beta.io,Beta,Sam,Lee\n";
    fireEvent.change(within(card).getByLabelText("CSV file"), { target: { files: [new File([csv], "leads.csv", { type: "text/csv" })] } });
    expect(await within(card).findByText(/2 people/)).toHaveTextContent("2 people. Emails from “Work Email”, companies from “Company Name”, names from “First Name” and “Last Name”.");
    fireEvent.click(within(card).getByRole("button", { name: "Use this list" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/bridges/source-connect") && c.method === "POST")).toBe(true));
    const [source] = (calls.find((c) => c.method === "POST")!.body as { leadSources: Record<string, unknown>[] }).leadSources;
    expect(source).toMatchObject({ icp: "agency-owners", fetcherType: "csv", csvMapping: { email: "Work Email", companyName: "Company Name", firstName: "First Name", lastName: "Last Name" } });
    await waitFor(() => expect(line(/Agency owners:/)).toHaveTextContent("Agency owners: 2 people from a CSV"));
  });

  it("says what a skill with nothing to set does, with no Save", async () => {
    mockFetch({ "/setup/cold-open": coldOpenState });
    render(<ColdOpenSetup engagementId="e1" onCancel={() => {}} focus="send-report" />);
    expect(await screen.findByText(/Sums up each week's sending/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});

describe("a Reputation Manager skill's own settings", () => {
  it("shows Crisis Response's contact and level, not every name", async () => {
    const calls = mockFetch({ "/setup/rep": { ...repState, configured: true, skills: {}, proposal: { ...repState.proposal, soleAuthority: { saved: "Ada Mudd", suggestion: null } } } });
    const onSaved = vi.fn();
    render(<RepSetup engagementId="e1" onCancel={() => {}} onSaved={onSaved} focus="rep-crisis-response" />);
    // The focused view is headed by the skill's own name (RepHeader), not the
    // shared "Settings for {buyer}" line the other products use.
    await screen.findByText(/Pages one person the moment serious findings add up/);
    expect(line(/Page at severity/)).toBeInTheDocument();
    expect(screen.getByText(/is paged when/)).toHaveTextContent("Ada Mudd is paged when something's serious");
    expect(screen.queryByRole("button", { name: "Mudd" })).not.toBeInTheDocument();
    fireEvent.click(within(line(/Page at severity/).closest("li")!).getByRole("button", { name: "Change" }));
    fireEvent.change(await screen.findByLabelText("Severity"), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({}));
    const body = calls.find((c) => c.url.endsWith("/bridges/rep-onboarding"))!.body as Record<string, unknown>;
    expect(body.crisisThresholdOverride).toBe(70);
    expect(body).not.toHaveProperty("skills");
  });
});

describe("a Whop Agent skill's own settings", () => {
  it("shows Refund and Dispute Alerts' levels only", async () => {
    mockFetch({ "/setup/whop": whopState });
    render(<WhopSetup engagementId="e1" onCancel={() => {}} focus="whop-refund-dispute-velocity" />);
    await screen.findByText("Settings for Mudd1s");
    expect(line(/Warn you when/)).toBeInTheDocument();
    expect(screen.queryByText("$5,880")).not.toBeInTheDocument();
    expect(screen.queryByText(/Choose a save offer/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("says a worker with nothing to set runs on the connection", async () => {
    mockFetch({ "/setup/whop": whopState });
    render(<WhopSetup engagementId="e1" onCancel={() => {}} focus="whop-dispute-response" />);
    expect(await screen.findByText(/nothing to set/)).toHaveTextContent("Gathers evidence and drafts a response the moment a dispute or dispute alert arrives. There's nothing to set: it runs on your Whop connection.");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("is still the full setup before Whop Agent has been set up", async () => {
    mockFetch({ "/setup/whop": { ...whopState, configured: false } });
    render(<WhopSetup engagementId="e1" onCancel={() => {}} focus="whop-refund-dispute-velocity" />);
    expect(await screen.findByText("What should Whop Agent do?")).toBeInTheDocument();
  });
});
