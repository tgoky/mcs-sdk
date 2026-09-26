import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeError, fingerprint, parseSentryDsn, sentryEnvelope, shouldAlert, reportError } from "@/lib/error-reporting";

describe("error reporting", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads any thrown value", () => {
    expect(normalizeError(new TypeError("bad"))).toMatchObject({ name: "TypeError", message: "bad" });
    expect(normalizeError({ name: "JevError", message: "429" })).toMatchObject({ name: "JevError", message: "429" });
    expect(normalizeError("plain")).toEqual({ name: "Error", message: "plain", stack: null });
  });

  it("treats the same failure for different records as one problem", () => {
    const ctx = { kind: "job" as const, where: "process-sms-reply" };
    const a = fingerprint(normalizeError(new Error("booking 123 not found for 0b7e2f4a-1c2d-4e5f-9a8b-7c6d5e4f3a21")), ctx);
    const b = fingerprint(normalizeError(new Error("booking 456 not found for 9a8b7c6d-5e4f-4a21-8b7e-2f4a1c2d4e5f")), ctx);
    expect(a).toBe(b);
    expect(fingerprint(normalizeError(new Error("booking 1 not found")), { kind: "job", where: "other-job" })).not.toBe(a);
  });

  it("builds Sentry's envelope endpoint from the DSN", () => {
    expect(parseSentryDsn("https://abc123@o42.ingest.sentry.io/4507")).toEqual({ endpoint: "https://o42.ingest.sentry.io/api/4507/envelope/", publicKey: "abc123" });
    expect(parseSentryDsn("https://key@sentry.example.com/team/99")).toEqual({ endpoint: "https://sentry.example.com/team/api/99/envelope/", publicKey: "key" });
    expect(parseSentryDsn("not a dsn")).toBeNull();
    expect(parseSentryDsn(undefined)).toBeNull();
  });

  it("writes a three-line envelope with the error and where it happened", () => {
    const lines = sentryEnvelope(normalizeError(new Error("boom")), { kind: "request", where: "POST /api/x", engagementId: "e1" }, "fp1", new Date("2026-09-26T00:00:00Z")).split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1])).toEqual({ type: "event" });
    expect(JSON.parse(lines[2])).toMatchObject({ level: "error", fingerprint: ["fp1"], exception: { values: [{ type: "Error", value: "boom" }] }, tags: { kind: "request", where: "POST /api/x", engagement: "e1" } });
  });

  it("alerts once per problem every 15 minutes", () => {
    const t = 1_000_000;
    expect(shouldAlert("fp-throttle", t)).toBe(true);
    expect(shouldAlert("fp-throttle", t + 60_000)).toBe(false);
    expect(shouldAlert("fp-throttle", t + 16 * 60_000)).toBe(true);
  });

  it("sends to Sentry and Slack when configured, and never throws", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc@o1.ingest.sentry.io/7");
    vi.stubEnv("ERROR_ALERT_SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T/B/x");
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await reportError(new Error("unique failure " + Math.random()), { kind: "job", where: "some-job", engagementId: "e1", runId: "r1" });
    const urls = fetchMock.mock.calls.map((c) => (c as unknown[])[0]);
    expect(urls).toEqual(["https://o1.ingest.sentry.io/api/7/envelope/", "https://hooks.slack.com/services/T/B/x"]);

    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(reportError(new Error("another " + Math.random()), { kind: "request", where: "x" })).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("only logs when nothing is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await reportError(new Error("x"), { kind: "client", where: "/dashboard" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
