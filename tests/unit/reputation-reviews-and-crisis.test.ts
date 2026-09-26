import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/credentials", () => ({ resolveCredential: vi.fn(async () => "test-credential") }));
const askJev = vi.fn();
vi.mock("@/lib/jev", () => ({ askJev: (...a: unknown[]) => askJev(...a) }));

const config = { current: null as Record<string, unknown> | null };
const upserts: Record<string, unknown>[] = [];
vi.mock("@/features/cold-open/server/config", () => ({
  getColdOpenConfig: async () => config.current,
  upsertColdOpenConfig: async (_id: string, patch: Record<string, unknown>) => {
    upserts.push(JSON.parse(JSON.stringify(patch)));
    config.current = { ...config.current, ...patch };
    return config.current;
  },
}));
const queued: { type: string; payload: Record<string, unknown>; reason?: string }[] = [];
vi.mock("@/lib/approval-gate", () => ({
  queuePendingAction: async (_e: string, type: string, payload: Record<string, unknown>, reason?: string) => {
    queued.push({ type, payload, reason });
    return "action-1";
  },
}));
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: async () => true }));
const setPaused = vi.fn();
vi.mock("@/features/cold-open/server/esp/factory", () => ({ createEspAdapter: () => ({ setCampaignPaused: setPaused }) }));

import { InstantlyAdapter } from "@/features/cold-open/server/esp/instantly";
import { SmartleadAdapter } from "@/features/cold-open/server/esp/smartlead";
import { ReplyIoAdapter } from "@/features/cold-open/server/esp/reply-io";
import { LemlistAdapter } from "@/features/cold-open/server/esp/lemlist";
import { coldOpenCampaignIds, executeCrisisPause, executeCrisisResume, pauseOutcomeLine, proposeCrisisPause, proposeCrisisResume } from "@/features/cold-open/server/crisis-pause";
import {
  nameKey,
  parseReviewRequestSettings,
  pickReviewChannel,
  renderReviewRequest,
  reviewsAfterAsking,
  DEFAULT_REVIEW_MESSAGE,
} from "@/features/reputation-manager/server/review-request-message";
import { labelReviews, labelsFromAnswers, topComplaint } from "@/features/reputation-manager/server/review-labels";

// ── Sending tools: the exact pause calls ──

describe("pausing a campaign in the sending tool", () => {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal("fetch", async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      calls.push({ url, method: init.method, headers: init.headers, body: init.body });
      return new Response("{}", { status: 200 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("Instantly: POST /campaigns/{id}/pause and /activate, no body", async () => {
    const a = new InstantlyAdapter("e1", {});
    expect(await a.setCampaignPaused("camp 1", true)).toBe(true);
    await a.setCampaignPaused("camp 1", false);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["POST", "https://api.instantly.ai/api/v2/campaigns/camp%201/pause"],
      ["POST", "https://api.instantly.ai/api/v2/campaigns/camp%201/activate"],
    ]);
    expect(calls[0].body).toBeUndefined();
    expect(calls[0].headers["Content-Type"]).toBeUndefined();
    expect(calls[0].headers.Authorization).toBe("Bearer test-credential");
  });

  it("Smartlead: POST /campaigns/{id}/status with PAUSED, then START", async () => {
    const a = new SmartleadAdapter("e1", {});
    await a.setCampaignPaused("42", true);
    await a.setCampaignPaused("42", false);
    expect(calls[0].url).toBe("https://server.smartlead.ai/api/v1/campaigns/42/status?api_key=test-credential");
    expect(JSON.parse(calls[0].body!)).toEqual({ status: "PAUSED" });
    expect(JSON.parse(calls[1].body!)).toEqual({ status: "START" });
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
  });

  it("Reply.io: POST /v3/sequences/{id}/pause and /start", async () => {
    const a = new ReplyIoAdapter("e1", {});
    (a as unknown as { requestIntervalMs: number }).requestIntervalMs = 0; // skip Reply's 6.5s pacing in the test
    await a.setCampaignPaused("777", true);
    await a.setCampaignPaused("777", false);
    expect(calls.map((c) => c.url)).toEqual(["https://api.reply.io/v3/sequences/777/pause", "https://api.reply.io/v3/sequences/777/start"]);
    expect(calls[0].headers["X-Api-Key"]).toBe("test-credential");
  });

  it("lemlist: not paused from here", async () => {
    expect(await new LemlistAdapter("e1", {}).setCampaignPaused("c", true)).toBe(false);
    expect(calls).toEqual([]);
  });
});

// ── The crisis pause ──

describe("crisis pause of Cold Open", () => {
  beforeEach(() => {
    queued.length = 0;
    upserts.length = 0;
    setPaused.mockReset();
    config.current = { sendPlatform: { platform: "instantly" }, campaignMap: { founders: "c1", agencies: "c2", other: "c1" }, sendingPause: null };
  });

  it("takes each campaign once", () => {
    expect(coldOpenCampaignIds({ a: "c1", b: " c2 ", c: "c1", d: "" })).toEqual(["c1", "c2"]);
  });

  it("proposes the pause for approval, never acting on its own", async () => {
    expect(await proposeCrisisPause("e1", "inc-1", "A wave of scam claims on Reddit.")).toBe("action-1");
    expect(queued[0]).toMatchObject({ type: "cold_open_crisis_pause", payload: { incidentId: "inc-1", campaignIds: ["c1", "c2"] } });
    expect(queued[0].reason).toContain("2 campaigns paused in Instantly");
    expect(setPaused).not.toHaveBeenCalled();
  });

  it("does nothing when Cold Open isn't sending or is already paused", async () => {
    config.current = { sendPlatform: null, campaignMap: {} };
    expect(await proposeCrisisPause("e1", "inc-1", "x")).toBeNull();
    config.current = { sendPlatform: { platform: "instantly" }, campaignMap: { a: "c1" }, sendingPause: { incidentId: "inc-0", pausedAt: "", campaigns: [] } };
    expect(await proposeCrisisPause("e1", "inc-1", "x")).toBeNull();
    expect(queued).toEqual([]);
  });

  it("on approval stops our pushes first, then pauses each campaign and records what each tool said", async () => {
    setPaused.mockImplementation(async (id: string) => {
      if (id === "c2") throw new Error("instantly API 403: forbidden");
      return true;
    });
    await expect(executeCrisisPause("e1", { incidentId: "inc-1", campaignIds: ["c1", "c2"] })).rejects.toThrow("refused to pause c2");
    expect(upserts[0]).toMatchObject({ sendingPause: { incidentId: "inc-1", campaigns: [] } });
    expect((config.current!.sendingPause as { campaigns: unknown[] }).campaigns).toEqual([
      { id: "c1", result: "paused" },
      { id: "c2", result: "failed", detail: "instantly API 403: forbidden" },
    ]);
  });

  it("tells the client to pause a tool that can't be paused from here", () => {
    expect(pauseOutcomeLine({ campaigns: [{ id: "c9", result: "not_supported" }] }, "lemlist")).toBe(
      "Cold Open stopped pushing new leads. lemlist campaigns can't be paused from here: pause c9 in lemlist yourself."
    );
  });

  it("restarts only what it paused, once the incident is resolved and it's approved", async () => {
    config.current = { ...config.current, sendingPause: { incidentId: "inc-1", pausedAt: "", campaigns: [{ id: "c1", result: "paused" }, { id: "c2", result: "failed" }] } };
    expect(await proposeCrisisResume("e1", "inc-other")).toBeNull();
    await proposeCrisisResume("e1", "inc-1");
    expect(queued[0]).toMatchObject({ type: "cold_open_crisis_resume", payload: { campaignIds: ["c1"] } });
    setPaused.mockResolvedValue(true);
    await executeCrisisResume("e1", { incidentId: "inc-1", campaignIds: ["c1"] });
    expect(setPaused).toHaveBeenCalledWith("c1", false);
    expect(config.current!.sendingPause).toBeNull();
  });
});

// ── Review requests ──

describe("review requests", () => {
  it("asks by first name with the client's link", () => {
    expect(renderReviewRequest(DEFAULT_REVIEW_MESSAGE, "Sam Lee", "https://g.page/r/abc/review")).toBe("Hi Sam, thanks for your time with us. Would you share how it went? It takes a minute: https://g.page/r/abc/review");
    expect(renderReviewRequest("Hi {name}: {link}", null, "https://x.test")).toBe("Hi there: https://x.test");
  });

  it("uses the preferred channel when it can, else the other", () => {
    expect(pickReviewChannel({ prefer: "email", emailReady: true, smsReady: true })).toBe("email");
    expect(pickReviewChannel({ prefer: "email", emailReady: false, smsReady: true })).toBe("sms");
    expect(pickReviewChannel({ prefer: "sms", emailReady: true, smsReady: false })).toBe("email");
    expect(pickReviewChannel({ prefer: "sms", emailReady: false, smsReady: false })).toBeNull();
  });

  it("matches a review to an ask by full name, after the ask and within 30 days", () => {
    expect(nameKey("  Sam   Lee-Park ")).toBe("sam lee-park");
    expect(nameKey("Sam")).toBeNull();
    const asked = [{ name: "Sam Lee", sentAt: new Date("2026-09-01") }];
    expect(reviewsAfterAsking(asked, [{ author: "sam lee", postedAt: new Date("2026-09-05") }])).toBe(1);
    expect(reviewsAfterAsking(asked, [{ author: "Sam Lee", postedAt: new Date("2026-08-30") }])).toBe(0); // before the ask
    expect(reviewsAfterAsking(asked, [{ author: "Sam Lee", postedAt: new Date("2026-10-15") }])).toBe(0); // too late
    expect(reviewsAfterAsking(asked, [{ author: "Sam", postedAt: new Date("2026-09-05") }])).toBe(0); // first name only
  });

  it("checks the settings the client saves", () => {
    expect(parseReviewRequestSettings({ link: "https://g.page/r/abc/review", delayHours: "3", channel: "sms" })).toEqual({ link: "https://g.page/r/abc/review", message: null, subject: null, delayHours: 3, channel: "sms" });
    expect(parseReviewRequestSettings({ link: "http://g.page/x" })).toMatchObject({ field: "link" });
    expect(parseReviewRequestSettings({ link: "not a url" })).toMatchObject({ field: "link" });
    expect(parseReviewRequestSettings({ link: "https://x.test", message: "Please review us" })).toMatchObject({ field: "message" });
    expect(parseReviewRequestSettings({ link: "https://x.test", delayHours: 500 })).toMatchObject({ field: "delayHours" });
    expect(parseReviewRequestSettings({ link: "" })).toMatchObject({ link: "", channel: "email" });
  });
});

// ── Review labels ──

describe("what reviews are about (Jev)", () => {
  beforeEach(() => askJev.mockReset());

  it("keeps the topics Jev is fairly sure of", () => {
    expect(labelsFromAnswers({ support: { type: "noul", noul: 0.9 }, results: { type: "noul", noul: 0.4 }, price_refund: { type: "noul", noul: 0.6 } })).toEqual(["support", "price_refund"]);
  });

  it("asks one question per topic in one call per review, and leaves a review unlabelled when Jev fails", async () => {
    askJev.mockResolvedValueOnce({ answers: { support: { type: "noul", noul: 0.95 } } }).mockRejectedValueOnce(new Error("down"));
    const out = await labelReviews("e1", [{ text: "Nobody answered my emails", rating: 1 }, { text: "Great", rating: 5 }, { text: " ", rating: 3 }]);
    expect(out).toEqual([["support"], [], []]);
    expect(askJev).toHaveBeenCalledTimes(2);
    const call = askJev.mock.calls[0][0] as { questions: Record<string, { type: string }>; reading: { purpose: string } };
    expect(Object.keys(call.questions)).toEqual(["support", "results", "price_refund", "delivery", "honesty", "staff"]);
    expect(Object.values(call.questions).every((q) => q.type === "noul")).toBe(true);
    expect(call.reading.purpose).toBe("review-labels");
  });

  it("finds what bad reviews mention most", () => {
    expect(
      topComplaint([
        { labels: ["support", "price_refund"], rating: 1, sentiment: "negative" },
        { labels: ["support"], rating: 2, sentiment: "negative" },
        { labels: ["results"], rating: 5, sentiment: "positive" },
        { labels: ["price_refund"], rating: null, sentiment: "negative" },
      ])
    ).toEqual({ label: "support", count: 2, of: 3 });
    expect(topComplaint([{ labels: ["results"], rating: 5, sentiment: "positive" }])).toBeNull();
  });
});
