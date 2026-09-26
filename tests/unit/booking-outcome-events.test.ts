import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { detectPlatformOutcome } from "@/lib/booking-outcome-events";

describe("outcomes the booking tool reports", () => {
  it("reads a Calendly no-show mark, keyed the way the roster stores the booking", () => {
    const payload = {
      event: "invitee_no_show.created",
      payload: { uri: "https://api.calendly.com/invitee_no_shows/NS1", invitee: "https://api.calendly.com/scheduled_events/EV1/invitees/INV1", created_at: "2026-09-26T10:00:00Z" },
    };
    expect(detectPlatformOutcome("calendly", payload)).toEqual({ outcome: "no_show", bookingIds: ["INV1", "EV1"] });
  });

  it("leaves Calendly's ordinary booking events to the booking path", () => {
    expect(detectPlatformOutcome("calendly", { event: "invitee.created", payload: { uri: "x" } })).toBeNull();
    expect(detectPlatformOutcome("calendly", { event: "invitee_no_show.created", payload: {} })).toBeNull();
  });

  it("reads GoHighLevel's showed and noshow statuses, in the shapes GHL sends", () => {
    expect(detectPlatformOutcome("ghl_calendar", { type: "AppointmentUpdate", appointment: { id: "A1", appointmentStatus: "noshow" } })).toEqual({ outcome: "no_show", bookingIds: ["A1"] });
    expect(detectPlatformOutcome("ghl_calendar", { type: "AppointmentUpdate", appointment: { id: "A1", appointmentStatus: "showed" } })).toEqual({ outcome: "showed", bookingIds: ["A1"] });
    // A workflow webhook: appointment under "calendar", status written loosely.
    expect(detectPlatformOutcome("ghl_calendar", { id: "C9", calendar: { appointmentId: "A2", status: "No Show" } })).toEqual({ outcome: "no_show", bookingIds: ["A2", "C9"] });
  });

  it("ignores statuses that aren't outcomes, and other platforms", () => {
    for (const status of ["confirmed", "cancelled", "new", "invalid"]) {
      expect(detectPlatformOutcome("ghl_calendar", { appointment: { id: "A1", appointmentStatus: status } })).toBeNull();
    }
    expect(detectPlatformOutcome("cal_com", { event: "invitee_no_show.created" })).toBeNull();
    expect(detectPlatformOutcome("ghl_calendar", null)).toBeNull();
  });
});

// ── Through the booking webhook ─────────────────────────────────────────

const resolveCallOutcome = vi.fn(async () => ({ recorded: true, prospectEmail: "jo@x.com", winBack: "enrolled", cohort: "none" }));
vi.mock("@/features/pre-call-read/server/outcome-resolution", () => ({ resolveCallOutcome: (...a: unknown[]) => (resolveCallOutcome as (...x: unknown[]) => unknown)(...a) }));
vi.mock("@/lib/signing-secrets", () => ({ getSigningSecret: async () => "whsec" }));
vi.mock("@/lib/engagement-stack", () => ({ patchEngagementStack: async () => undefined }));
vi.mock("@/lib/booking-roster", () => ({ upsertBookingRoster: vi.fn(async () => ({ wrote: true })) }));
vi.mock("@/lib/inngest", () => ({ inngest: { send: vi.fn() }, bookingWebhookProcess: { create: vi.fn() } }));
vi.mock("@/lib/run-log", () => ({ startRun: vi.fn(), failRun: vi.fn() }));
vi.mock("@/lib/approval-gate", () => ({ gateOrExecute: vi.fn() }));
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: vi.fn(async () => true) }));
let rosterIds: string[] = [];
const inserted: Record<string, unknown>[] = [];
let duplicate = false;
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: (t: { __name?: string }) => ({
        where: () => {
          const rows = t.__name === "booking_roster" ? rosterIds.map((id) => ({ id })) : [{ engagementId: "e1", stack: { booking_platform: "calendly" } }];
          return { then: (f: (r: unknown[]) => unknown) => Promise.resolve(f(rows)), limit: async () => rows };
        },
      }),
    }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        if (duplicate) throw Object.assign(new Error("dup"), { code: "23505" });
        inserted.push(v);
      },
    }),
    delete: () => ({ where: async () => undefined }),
  },
}));
vi.mock("@/models/schema", () => ({ engagements: { __name: "engagements" }, webhookEvents: { __name: "webhook_events" }, bookingRoster: { __name: "booking_roster", externalCallId: "x", engagementId: "y" } }));
vi.mock("drizzle-orm", () => ({ and: () => ({}), eq: () => ({}), gt: () => ({}), inArray: () => ({}), sql: () => ({}) }));

function signedCalendly(body: object) {
  const raw = JSON.stringify(body);
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", "whsec").update(`${t}.${raw}`).digest("hex");
  return new Request("https://app.example.com/api/webhooks/booking-event?engagement_id=e1", { method: "POST", headers: { "calendly-webhook-signature": `t=${t},v1=${v1}` }, body: raw });
}

describe("booking webhook: a Calendly no-show mark", () => {
  const noShow = { event: "invitee_no_show.created", payload: { uri: "https://api.calendly.com/invitee_no_shows/NS1", invitee: "https://api.calendly.com/scheduled_events/EV1/invitees/INV1" } };

  beforeEach(() => {
    vi.clearAllMocks();
    inserted.length = 0;
    duplicate = false;
    rosterIds = [];
  });

  it("records it as a no-show on the booking the roster knows, like a Slack tap would", async () => {
    rosterIds = ["EV1"];
    const { POST } = await import("@/app/api/webhooks/booking-event/route");
    const res = await POST(signedCalendly(noShow));
    expect(await res.json()).toMatchObject({ success: true, outcome: "no_show", recorded: true });
    expect(resolveCallOutcome).toHaveBeenCalledWith({ engagementId: "e1", bookingId: "EV1", outcome: "no_show", source: "booking_platform" });
    expect(inserted[0]).toMatchObject({ idempotencyKey: "outcome:EV1:no_show", eventKind: "outcome" });
  });

  it("ignores a redelivery of the same mark", async () => {
    duplicate = true;
    const { POST } = await import("@/app/api/webhooks/booking-event/route");
    const res = await POST(signedCalendly(noShow));
    expect(await res.json()).toMatchObject({ deduplicated: true });
    expect(resolveCallOutcome).not.toHaveBeenCalled();
  });
});
