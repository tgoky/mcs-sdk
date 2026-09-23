import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/http", () => ({ fetchWithTimeout: vi.fn() }));

import { fetchWithTimeout } from "@/lib/http";
import { pullInstantly, pullSmartlead } from "@/lib/cold-open-setup/sender";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function route(table: [string, (init?: RequestInit) => Response][]) {
  vi.mocked(fetchWithTimeout).mockImplementation(async (input, init) => {
    const url = String(input);
    const hit = table.find(([m]) => url.includes(m));
    return hit ? hit[1](init) : json({}, 404);
  });
}
beforeEach(() => vi.mocked(fetchWithTimeout).mockReset());

describe("pullInstantly", () => {
  it("reads campaigns with results, their sequences and timezone, and the mailboxes", async () => {
    route([
      ["/campaigns/analytics", () => json([{ campaign_id: "c1", campaign_name: "Agencies", emails_sent_count: 1200, open_count: 600, reply_count: 36, bounced_count: 12 }])],
      [
        "/campaigns/c1",
        () =>
          json({
            id: "c1",
            campaign_schedule: { schedules: [{ name: "Weekdays", timezone: "America/Chicago" }] },
            sequences: [{ steps: [{ type: "email", delay: 0, variants: [{ subject: "quick question", body: "<p>Hi</p>" }] }, { type: "email", delay: 3, variants: [{ subject: "", body: "<p>Bump</p>" }] }] }],
          }),
      ],
      ["/campaigns?limit=100", () => json({ items: [{ id: "c1", name: "Agencies", status: 1 }], next_starting_after: null })],
      ["/accounts/warmup-analytics", () => json({ aggregate_data: { "jane@acme.com": { health_score: 97 } } })],
      ["/accounts?limit=100", () => json({ items: [{ email: "jane@acme.com", first_name: "Jane", last_name: "Doe", daily_limit: 40, warmup_status: 1 }] })],
    ]);
    const intel = await pullInstantly("key");
    expect(intel.campaigns).toEqual([{ id: "c1", name: "Agencies", status: "1", sent: 1200, opens: 600, replies: 36, bounces: 12 }]);
    expect(intel.timezone).toBe("America/Chicago");
    expect(intel.steps.map((s) => [s.step, s.subject, s.body])).toEqual([
      [1, "quick question", "<p>Hi</p>"],
      [2, "", "<p>Bump</p>"],
    ]);
    expect(intel.mailboxes).toEqual([{ email: "jane@acme.com", fromName: "Jane Doe", dailyLimit: 40, warmupStatus: "1", health: 97, broken: false }]);
    const auth = (vi.mocked(fetchWithTimeout).mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(auth.Authorization).toBe("Bearer key");
  });
});

describe("pullSmartlead", () => {
  it("reads results, sequences and mailboxes with the key as a query param", async () => {
    route([
      ["/campaigns/7/analytics", () => json({ sent_count: 500, unique_sent_count: 480, open_count: 200, reply_count: 24, bounce_count: 5 })],
      ["/campaigns/7/sequences", () => json([{ seq_number: 1, subject: "idea", email_body: "<p>Hi</p>" }, { seq_number: 2, subject: "", email_body: "<p>Bump</p>" }])],
      ["/campaigns?", () => json([{ id: 7, name: "SaaS", status: "ACTIVE" }])],
      ["/email-accounts", () => json([{ from_email: "sam@acme.io", from_name: "Sam", message_per_day: 30, warmup_details: { status: "ACTIVE", warmup_reputation: "96%" }, is_smtp_success: true }, { from_email: "old@acme.io", from_name: "Old", message_per_day: 30, is_smtp_success: false }])],
    ]);
    const intel = await pullSmartlead("sk");
    expect(intel.campaigns[0]).toMatchObject({ id: "7", sent: 480, replies: 24, bounces: 5 });
    expect(intel.steps.map((s) => s.step)).toEqual([1, 2]);
    expect(intel.mailboxes.map((m) => [m.email, m.health, m.broken])).toEqual([
      ["sam@acme.io", 96, false],
      ["old@acme.io", null, true],
    ]);
    expect(vi.mocked(fetchWithTimeout).mock.calls.every((c) => String(c[0]).includes("api_key=sk"))).toBe(true);
  });
});
