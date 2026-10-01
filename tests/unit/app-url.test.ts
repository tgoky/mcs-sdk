import { describe, it, expect, vi, afterEach } from "vitest";
import { getAppUrl, getAppUrlOrNull } from "@/lib/app-url";
import { buildWebhookReceiverUrl } from "@/lib/booking-sync-status";

afterEach(() => vi.unstubAllEnvs());

describe("app URL", () => {
  it("uses NEXT_PUBLIC_APP_URL without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
    expect(getAppUrl()).toBe("https://app.example.com");
  });

  it("fails loudly when it isn't set, instead of falling back to an old address", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getAppUrlOrNull()).toBeNull();
    expect(() => getAppUrl()).toThrow(/NEXT_PUBLIC_APP_URL is not set/);
  });

  it("never throws for an address that's only displayed", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(buildWebhookReceiverUrl("eng_1")).toBe("/api/webhooks/booking-event?engagement_id=eng_1");
  });
});
