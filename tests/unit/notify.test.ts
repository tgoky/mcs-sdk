import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
  },
}));

import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notify";

const baseOpts = {
  whopUserId: "user-1",
  engagementId: "eng-1",
  runId: "run-1",
  type: "run_failed" as const,
  severity: "critical" as const,
  title: "A run failed",
  body: "Pin-Down failed for Acme Co.",
};

describe("notifyUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    // Restore the default db behavior after any test that swapped it out.
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) } as any);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("always writes the in-app notification, with no Slack/email configured", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    await notifyUser(baseOpts);

    expect(db.insert).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled(); // no Slack webhook, no RESEND_API_KEY
  });

  it("stores the exact fields passed in, defaulting engagementId/runId to null when omitted", async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as any);

    await notifyUser({
      whopUserId: "user-2",
      type: "weekly_metrics",
      severity: "info",
      title: "Weekly digest",
      body: "3 bookings this week.",
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whopUserId: "user-2",
        engagementId: null,
        runId: null,
        type: "weekly_metrics",
        severity: "info",
        read: false,
      })
    );
  });

  it("never throws when the in-app DB write fails, and still attempts Slack", async () => {
    vi.mocked(db.insert).mockImplementation(() => {
      throw new Error("connection reset");
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    await expect(
      notifyUser({ ...baseOpts, slackWebhookUrl: "https://hooks.slack.com/services/x" })
    ).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalled();
  });

  it("posts to Slack only when the engagement has a webhook configured", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    await notifyUser({ ...baseOpts, slackWebhookUrl: "https://hooks.slack.com/services/x" });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/x",
      expect.objectContaining({ method: "POST" })
    );
    const [, options] = vi.mocked(global.fetch).mock.calls[0];
    const payload = JSON.parse((options as RequestInit).body as string);
    expect(payload.text).toContain("CRITICAL");
    expect(payload.text).toContain("A run failed");
    expect(payload.text).toContain("Pin-Down failed for Acme Co.");
  });

  it("swallows a Slack delivery failure without throwing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("slack is down")) as unknown as typeof fetch;
    await expect(
      notifyUser({ ...baseOpts, slackWebhookUrl: "https://hooks.slack.com/services/x" })
    ).resolves.toBeUndefined();
  });

  it("never calls the email API when RESEND_API_KEY is unset, even with a Slack webhook", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    await notifyUser({ ...baseOpts, slackWebhookUrl: "https://hooks.slack.com/services/x" });

    const calledUrls = vi.mocked(global.fetch).mock.calls.map((c) => c[0]);
    expect(calledUrls).not.toContain("https://api.resend.com/emails");
  });

  it("sends an email via Resend when RESEND_API_KEY is set and the user has an email on file", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ email: "sarah@acme.com" }]) })),
      })),
    } as any);
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    await notifyUser(baseOpts);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test_key" }),
      })
    );
    const [, options] = vi.mocked(global.fetch).mock.calls[0];
    const payload = JSON.parse((options as RequestInit).body as string);
    expect(payload.to).toBe("sarah@acme.com");
    expect(payload.from).toBe("alerts@showtime.app"); // default sender
  });

  it("uses RESEND_FROM_EMAIL as the sender when configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "notifications@mudd.ventures";
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ email: "sarah@acme.com" }]) })),
      })),
    } as any);
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    await notifyUser(baseOpts);

    const [, options] = vi.mocked(global.fetch).mock.calls[0];
    const payload = JSON.parse((options as RequestInit).body as string);
    expect(payload.from).toBe("notifications@mudd.ventures");
  });

  it("skips the email channel when RESEND_API_KEY is set but the user has no email on file", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    // db.select's default mock (from beforeEach) returns [] — no user row.
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    await notifyUser(baseOpts);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("never throws when Resend returns a non-ok response", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ email: "sarah@acme.com" }]) })),
      })),
    } as any);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => "invalid api key" }) as unknown as typeof fetch;

    await expect(notifyUser(baseOpts)).resolves.toBeUndefined();
  });

  it("never throws when the email channel's DB lookup itself fails", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("pool exhausted");
    });
    global.fetch = vi.fn() as unknown as typeof fetch;

    await expect(notifyUser(baseOpts)).resolves.toBeUndefined();
    // In-app write should already have gone through before this channel runs.
    expect(db.insert).toHaveBeenCalled();
  });

  it("runs all three channels independently — a Slack failure doesn't block email", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ email: "sarah@acme.com" }]) })),
      })),
    } as any);

    const fetchMock = vi.fn((url: string) => {
      if (url.includes("slack")) return Promise.reject(new Error("slack down"));
      return Promise.resolve({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await notifyUser({ ...baseOpts, slackWebhookUrl: "https://hooks.slack.com/services/down" }) as unknown as typeof fetch;

    expect(db.insert).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/services/down", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.anything());
  });
});
