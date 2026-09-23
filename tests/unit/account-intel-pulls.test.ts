import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/http", () => ({ fetchWithTimeout: vi.fn() }));

import { fetchWithTimeout } from "@/lib/http";
import { pullCalendly } from "@/lib/account-intel/booking";
import { mailchimpBase, pullHubSpot } from "@/lib/account-intel/crm";
import { intelSteps } from "@/lib/showtime-setup/intel-steps";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const now = new Date("2026-09-01T12:00:00Z");

/** Routes a mocked fetch by URL substring (and method). */
function route(table: [match: string, respond: (init?: RequestInit) => Response][]) {
  vi.mocked(fetchWithTimeout).mockImplementation(async (input, init) => {
    const url = String(input);
    const hit = table.find(([m]) => url.includes(m));
    return hit ? hit[1](init) : json({}, 404);
  });
}

beforeEach(() => vi.mocked(fetchWithTimeout).mockReset());

describe("pullCalendly", () => {
  it("reads event types, bookings, attendance, answers and sources", async () => {
    const past = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
    const events = Array.from({ length: 10 }, (_, i) => ({
      uri: `https://api.calendly.com/scheduled_events/e${i}`,
      name: "Strategy Call",
      status: i === 9 ? "canceled" : "active",
      start_time: past(i + 1),
      created_at: past(i + 4),
      event_type: "https://api.calendly.com/event_types/T1",
      event_memberships: [{ user_name: "Ana Diaz" }],
      cancellation: i === 9 ? { reason: "Budget got cut" } : undefined,
    }));
    route([
      ["/users/me", () => json({ resource: { uri: "https://api.calendly.com/users/U1", name: "Acme", timezone: "America/New_York", current_organization: "https://api.calendly.com/organizations/O1" } })],
      [
        "/event_types?user=",
        () =>
          json({
            collection: [
              { uri: "https://api.calendly.com/event_types/T1", name: "Strategy Call", slug: "strategy", scheduling_url: "https://calendly.com/acme/strategy", duration: 45, active: true, custom_questions: [{ name: "What's your biggest challenge?", enabled: true, required: true }] },
            ],
          }),
      ],
      ["/scheduled_events?user=", () => json({ collection: events, pagination: { next_page: null } })],
      [
        "/invitees",
        () =>
          json({
            collection: [
              { no_show: null, questions_and_answers: [{ question: "What's your biggest challenge?", answer: "Our leads stop replying" }], tracking: { utm_source: "youtube" } },
            ],
          }),
      ],
    ]);

    const intel = await pullCalendly("tok", now);
    expect(intel.coverage.blocked).toEqual([]);
    expect(intel.timeZone).toBe("America/New_York");
    expect(intel.booking?.meta).toEqual({ organization_uri: "https://api.calendly.com/organizations/O1" });
    expect(intel.booking?.eventTypes[0]).toMatchObject({ name: "Strategy Call", durationMin: 45, questions: [{ name: "What's your biggest challenge?" }] });
    const h = intel.booking!.history;
    expect(h.total).toBe(10);
    expect(h.canceled).toBe(1);
    expect(h.attendanceKnown).toBe(9);
    expect(h.noShowRate).toBe(0);
    expect(h.sources[0]).toEqual({ source: "youtube", count: 10 });
    expect(h.cancelReasons).toEqual(["Budget got cut"]);
    expect(intel.booking?.answers[0]).toMatchObject({ question: "What's your biggest challenge?", answers: ["Our leads stop replying"] });

    // Every scheduled_events call is scoped to the user (Calendly requires it).
    const calls = vi.mocked(fetchWithTimeout).mock.calls.map((c) => String(c[0]));
    expect(calls.filter((u) => u.includes("scheduled_events?")).every((u) => u.includes("user="))).toBe(true);
  });
});

describe("pullHubSpot", () => {
  it("reads deals and meetings, and reports what the connection may not see", async () => {
    route([
      ["/account-info/v3/details", () => json({ portalId: 1, timeZone: "Europe/London", companyCurrency: "GBP" })],
      ["/crm/v3/owners", () => json({ results: [{ id: "1", firstName: "Sam", lastName: "Lee", email: "sam@acme.com" }] })],
      ["/crm/v3/pipelines/deals", () => json({ results: [{ label: "Sales", stages: [{ id: "s1", label: "Proposal", metadata: { isClosed: "false" } }] }] })],
      [
        "/deals/search",
        () =>
          json({
            results: [
              ...Array.from({ length: 4 }, () => ({ properties: { amount: "5000", hs_is_closed: "true", hs_is_closed_won: "true", createdate: "2026-06-01", closedate: "2026-06-21" } })),
              { properties: { amount: "5000", hs_is_closed: "true", hs_is_closed_won: "false", closed_lost_reason: "Timing" } },
              { properties: { amount: "8000", hs_is_closed: "false", dealstage: "s1", hs_analytics_source: "PAID_SOCIAL" } },
            ],
          }),
      ],
      ["/meetings/search", () => json({ results: Array.from({ length: 10 }, (_, i) => ({ properties: { hs_meeting_outcome: i < 2 ? "NO_SHOW" : "COMPLETED" } })) })],
      ["/contacts/search", () => json({ total: 2400, results: [] })],
      ["/marketing/v3/emails", () => json({ message: "missing scope" }, 403)],
      ["/automation/v4/flows", () => json({ results: [{ name: "No-show follow-up", isEnabled: true }] })],
    ]);

    const intel = await pullHubSpot("tok", now);
    expect(intel.currency).toBe("GBP");
    expect(intel.deals).toMatchObject({ total: 6, won: 4, lost: 1, winRate: 80, averageWon: 5000, openValue: 8000, medianCycleDays: 20 });
    expect(intel.deals?.sources).toEqual([{ source: "paid social", count: 1 }]);
    expect(intel.meetings).toMatchObject({ noShows: 2, noShowRate: 20 });
    expect(intel.contacts?.total).toBe(2400);
    expect(intel.team).toEqual([{ name: "Sam Lee", email: "sam@acme.com", role: null }]);
    expect(intel.automations).toEqual([{ name: "No-show follow-up", status: "on", trigger: null }]);
    expect(intel.coverage.blocked).toEqual(["marketing emails"]);
    expect(intel.email).toBeUndefined();

    const labels = intelSteps(intel, "HubSpot").map((s) => s.label);
    expect(labels).toContain("HubSpot: 6 deals, 80% won");
    expect(labels).toContain("Average deal £5,000");
    expect(labels).toContain("20% no-shows logged in HubSpot");
    expect(labels).toContain("HubSpot didn't share marketing emails");
  });
});

describe("mailchimpBase", () => {
  it("reads the datacenter from a pasted key", async () => {
    expect(await mailchimpBase("abc123-us6")).toEqual({ base: "https://us6.api.mailchimp.com/3.0", auth: "Bearer abc123-us6" });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
  it("asks Mailchimp where an OAuth token lives", async () => {
    route([["oauth2/metadata", () => json({ dc: "us19", api_endpoint: "https://us19.api.mailchimp.com" })]]);
    expect(await mailchimpBase("oauthtoken")).toEqual({ base: "https://us19.api.mailchimp.com/3.0", auth: "Bearer oauthtoken" });
  });
});

describe("pullHubSpot with a Composio (OAuth) token", () => {
  it("skips parts the token wasn't granted instead of calling them, and keeps the portal's domain", async () => {
    route([
      ["/oauth/v1/access-tokens/", () => json({ scopes: ["oauth", "crm.objects.contacts.read", "crm.objects.deals.read"], hub_domain: "acme.com" })],
      ["/account-info/v3/details", () => json({ timeZone: "UTC" })],
      ["/crm/v3/pipelines/deals", () => json({ results: [] })],
      ["/deals/search", () => json({ results: [] })],
      ["/meetings/search", () => json({ results: [] })],
      ["/contacts/search", () => json({ total: 10, results: [] })],
    ]);
    const intel = await pullHubSpot("oauth-token", now);
    const calls = vi.mocked(fetchWithTimeout).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("/marketing/v3/emails"))).toBe(false);
    expect(calls.some((u) => u.includes("/automation/v4/flows"))).toBe(false);
    expect(calls.some((u) => u.includes("/crm/v3/owners"))).toBe(false);
    expect(intel.coverage.blocked.sort()).toEqual(["marketing emails", "team", "workflows"]);
    expect(intel.business?.website).toBe("acme.com");
  });

  it("doesn't look up a private-app token as OAuth", async () => {
    route([["/account-info/v3/details", () => json({})]]);
    await pullHubSpot("pat-na1-123", now);
    const calls = vi.mocked(fetchWithTimeout).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("/oauth/v1/access-tokens/"))).toBe(false);
  });
});
