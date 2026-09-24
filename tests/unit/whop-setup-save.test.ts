import { describe, it, expect, vi, beforeEach } from "vitest";

const patch = vi.fn<(id: string, p: Record<string, unknown>) => Promise<void>>(async () => {});
const enable = vi.fn<(id: string, skill: string, on: boolean) => Promise<void>>(async () => {});

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/engagement-stack", () => ({ patchEngagementStack: (id: string, p: Record<string, unknown>) => patch(id, p) }));
vi.mock("@/lib/engagement-skills", () => ({ setSkillEnabledForEngagement: (id: string, s: string, on: boolean) => enable(id, s, on) }));
vi.mock("@/lib/safe-fetch", () => {
  class UnsafeUrlError extends Error {}
  return {
    UnsafeUrlError,
    assertPublicUrl: async (raw: string) => {
      if (!raw.startsWith("https://")) throw new UnsafeUrlError("Only https.");
      return new URL(raw);
    },
  };
});
vi.mock("@/features/whop-agent/server/webhook-subscription-service", () => ({ syncAgentWebhookEvents: vi.fn() }));

import { saveWhopSetup, type WhopSetupInput } from "@/lib/whop-setup/save";
import { mergeWebhookEvents } from "@/features/whop-agent/server/webhook-events";

const input = (over: Partial<WhopSetupInput> = {}): WhopSetupInput => ({
  skills: ["whop-dispute-response", "whop-weekly-ops-report"],
  saveOffer: null,
  alerts: { refundRate: 0.06, disputeRate: 0.006, alertThreshold: 2, minSample: 10 },
  bridgeUrl: "",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("saveWhopSetup", () => {
  it("saves the settings, switches workers and syncs the one webhook", async () => {
    const sync = vi.fn(async () => ({ whopWebhookId: "hook_1", action: "created" as const }));
    const r = await saveWhopSetup("e1", input(), sync);
    expect(r).toEqual({ ok: true, webhook: { action: "created", events: ["dispute.created", "dispute_alert.created"] } });
    expect(patch.mock.calls[0][1]).toMatchObject({ refund_dispute_rate_threshold: 0.06, dispute_rate_threshold: 0.006, dispute_alert_threshold: 2, min_payment_sample_size: 10 });
    // No offer: any saved one is cleared, never left half set.
    expect(patch.mock.calls[0][1]).toHaveProperty("whop_save_offer_discount_percentage", undefined);
    expect(enable).toHaveBeenCalledWith("e1", "whop-dispute-response", true);
    expect(enable).toHaveBeenCalledWith("e1", "whop-cancellation-save-offer", false);
    expect(enable).toHaveBeenCalledWith("e1", "whop-connect", true);
  });

  it("keeps the settings when Whop refuses the webhook, and says why", async () => {
    const sync = vi.fn(async () => {
      throw new Error("No validated Api-Version-Date pin on file.");
    });
    const r = await saveWhopSetup("e1", input(), sync);
    expect(r).toMatchObject({ ok: true, webhook: { error: "No validated Api-Version-Date pin on file." } });
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("refuses a bridge address that isn't public https, before saving anything", async () => {
    const r = await saveWhopSetup("e1", input({ bridgeUrl: "http://10.0.0.1/hook" }), vi.fn());
    expect(r).toMatchObject({ field: "bridge" });
    expect(patch).not.toHaveBeenCalled();
  });

  it("saves a full save offer and the bridge", async () => {
    const sync = vi.fn(async () => ({ whopWebhookId: "hook_1", action: "updated" as const }));
    await saveWhopSetup("e1", input({ skills: ["whop-cancellation-save-offer", "whop-bridge-manager"], saveOffer: { discount: 30, months: 2, message: "Stay", minTenureDays: null, cooldownDays: 60 }, bridgeUrl: "https://hooks.example.com/x" }), sync);
    expect(patch.mock.calls[0][1]).toMatchObject({ whop_save_offer_discount_percentage: 30, whop_save_offer_duration_months: 2, whop_save_offer_message: "Stay", whop_save_offer_cooldown_days: 60, whop_bridge_destination_url: "https://hooks.example.com/x" });
    expect(sync.mock.calls[0]).toEqual(["e1", expect.arrayContaining(["membership.cancel_at_period_end_changed", "payment.succeeded"]), expect.anything()]);
  });

  it("keeps events another worker added to the webhook, and drops only switched-off workers' events", async () => {
    const sync = vi.fn<(id: string, events: string[], opts?: { keep?: (e: string) => boolean }) => Promise<{ whopWebhookId: string; action: "updated" }>>(async () => ({ whopWebhookId: "hook_1", action: "updated" }));
    await saveWhopSetup("e1", input(), sync);
    const keep = sync.mock.calls[0][2]!.keep!;
    // A preflight event isn't the setup's to drop; a setup worker's event is.
    expect(keep("course.created")).toBe(true);
    expect(keep("dispute.created")).toBe(false);
    expect(mergeWebhookEvents(["course.created", "refund.updated"], ["dispute.created"], keep)).toEqual(["course.created", "dispute.created"]);
    expect(mergeWebhookEvents(["course.created"], ["dispute.created"], () => true)).toEqual(["course.created", "dispute.created"]);
  });
});
