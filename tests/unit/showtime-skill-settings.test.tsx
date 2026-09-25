import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/engagements/e1/skills/leak-map",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { ShowtimeSkillSettings } from "@/components/product-setup/showtime-skill-settings";

const calls: { url: string; method: string; body: unknown }[] = [];
function mockFetch(routes: Record<string, unknown>) {
  calls.length = 0;
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "GET") {
      const hit = Object.entries(routes).find(([k]) => url.endsWith(k));
      if (hit) return new Response(JSON.stringify(hit[1]));
    }
    return new Response(JSON.stringify({ ok: true }));
  }) as unknown as typeof fetch;
}
const posted = (suffix: string) => calls.find((c) => c.method === "POST" && c.url.endsWith(suffix))?.body as Record<string, unknown> | undefined;
const row = (re: RegExp) => screen.getByText((_, el) => el?.tagName === "P" && re.test(el.textContent ?? "")).closest("li")!;

describe("a Showtime skill's own settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Funnel Audit: says where reports go, needs an address for email, and saves the same fields", async () => {
    mockFetch({ "/bridges/leak-map": { buyer: "Acme", weeklyScheduleDayOfWeek: 1, weeklyScheduleHour: 9, monthlyScheduleDayOfMonth: 1, leakMapTimezone: "UTC", auditOutputFormat: "dashboard_only" } });
    render(<ShowtimeSkillSettings engagementId="e1" skill="leak-map" onCancel={() => {}} />);
    await screen.findByText("Settings for Acme");
    expect(row(/weekly report every Monday at 09:00/)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fireEvent.click(within(row(/Reports stay on the dashboard/)).getByRole("button", { name: "Change" }));
    fireEvent.click(await screen.findByRole("button", { name: "Email" }));
    expect(await screen.findByText("Add the address reports are emailed to.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Send reports to"), { target: { value: " ops@acme.com " } });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(posted("/bridges/leak-map")).toBeDefined());
    expect(posted("/bridges/leak-map")).toEqual({
      weeklyScheduleDayOfWeek: 1,
      weeklyScheduleHour: 9,
      monthlyScheduleDayOfMonth: 1,
      leakMapTimezone: "UTC",
      auditOutputFormat: "email",
      leakMapReportEmail: "ops@acme.com",
    });
  });

  it("Win-Back: shows the pause with a way to resume, and asks for the HubSpot account when replies come from HubSpot", async () => {
    mockFetch({
      "/bridges/win-back": { buyer: "Acme", emailPlatform: "hubspot", inboundReplyMode: "native", hubspotPortalId: "", autoPaused: true, autoPausedReason: "Bounce rate 9% over 5%." },
      "/bridges/win-back/hubspot-portal": { portalId: "4242" },
    });
    render(<ShowtimeSkillSettings engagementId="e1" skill="win-back" onCancel={() => {}} />);
    await screen.findByText("Settings for Acme");
    expect(screen.getByText(/Bounce rate 9% over 5%/)).toBeInTheDocument();
    // The portal is read from HubSpot, not typed.
    expect(await screen.findByText((_, el) => el?.tagName === "P" && /HubSpot account 4242/.test(el.textContent ?? ""))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resume sending" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/win-back/resume-sends"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Resume sending" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posted("/bridges/win-back")).toBeDefined());
    expect(posted("/bridges/win-back")).toEqual({
      rescheduleMode: "time_slots",
      recoveredFromNoShowTaggingEnabled: true,
      inboundReplyMode: "native",
      hubspotPortalId: "4242",
      activecampaignWebhookSignatureHeader: "",
    });
  });

  it("Pile-On: both channels need a decision, and none is a decision", async () => {
    mockFetch({ "/workers/pile-on/enable-with-config": { buyer: "Acme", smsPlatform: null, adDataPlatform: "none", suggestions: { smsPlatform: { value: "twilio" } } } });
    render(<ShowtimeSkillSettings engagementId="e1" skill="pile-on" onCancel={() => {}} />);
    await screen.findByText("Settings for Acme");
    expect(screen.getByText("Choose texts (either can be off).")).toBeInTheDocument();
    expect(row(/Leads aren't sent to an ad audience/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use Twilio" }));
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(posted("/workers/pile-on/enable-with-config")).toBeDefined());
    expect(posted("/workers/pile-on/enable-with-config")).toMatchObject({ smsPlatform: "twilio", adDataPlatform: "none" });
  });

  it("Call Brief: a webhook Slack sends only the webhook and clears the channel", async () => {
    mockFetch({ "/bridges/pre-call-read": { buyer: "Acme", briefLandingDestination: "slack", slackWebhookUrl: "https://hooks.slack.com/services/T/B/x", slackChannelId: "" } });
    render(<ShowtimeSkillSettings engagementId="e1" skill="pre-call-read" onCancel={() => {}} />);
    await screen.findByText("Settings for Acme");
    expect(row(/Briefs are posted to Slack through its webhook/)).toBeInTheDocument();
    fireEvent.click(within(row(/Briefs are written every night/)).getByRole("button", { name: "Change" }));
    fireEvent.click(await screen.findByRole("button", { name: /As each call gets close/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posted("/bridges/pre-call-read")).toBeDefined());
    expect(posted("/bridges/pre-call-read")).toMatchObject({
      briefTriggerType: "dynamic_webhook",
      briefLandingDestination: "slack",
      slackWebhookUrl: "https://hooks.slack.com/services/T/B/x",
      slackChannelId: "",
    });
  });
});
