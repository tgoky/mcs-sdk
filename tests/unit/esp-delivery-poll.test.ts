import { describe, it, expect, vi, beforeEach } from "vitest";

// The HubSpot delivery poll reads the stack, records events, may auto-pause
// Win-Back (which writes win_back_auto_paused into the same stack column),
// then advances its watermark. The watermark write must touch only its own
// key: writing back the stack read at the top would erase the pause.

const update = vi.fn();
let stackRow: Record<string, unknown> = {};
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ stack: stackRow }] }) }) }),
    update: (...args: unknown[]) => update(...args),
  },
}));
vi.mock("@/lib/credentials", () => ({ resolveCredential: vi.fn(async () => "hs-token") }));
const pollDeliveryEvents = vi.fn();
vi.mock("@/lib/platforms/email", () => ({
  HubSpotClient: class {
    pollDeliveryEvents = pollDeliveryEvents;
  },
}));
vi.mock("@/lib/esp-delivery-events", () => ({ recordDeliveryEvent: vi.fn(async () => undefined) }));
const patchEngagementStack = vi.fn(async () => undefined);
vi.mock("@/lib/engagement-stack", () => ({ patchEngagementStack: (...args: unknown[]) => patchEngagementStack(...(args as [])) }));
const checkAndApplyAutoPause = vi.fn(async () => undefined);
vi.mock("@/features/win-back/server/esp-delivery-monitor", () => ({ checkAndApplyAutoPause: (...args: unknown[]) => checkAndApplyAutoPause(...(args as [])) }));
vi.mock("@/lib/engagement-status", () => ({ isEngagementPaused: vi.fn(() => false) }));
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: vi.fn(async () => true) }));

import { pollHubspotDeliveryForEngagement } from "@/features/win-back/server/esp-delivery-poll";

describe("pollHubspotDeliveryForEngagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stackRow = { email_platform: "hubspot", email_platform_credentials_ref: "v1", hubspot_delivery_poll_watermark_ms: 1000 };
  });

  it("advances only the watermark after an auto-pause, never the stale stack", async () => {
    pollDeliveryEvents.mockImplementation(async (type: string) => (type === "BOUNCE" ? [{ email: "a@x.com", occurredAtMs: 2000 }] : []));

    const result = await pollHubspotDeliveryForEngagement("e1");

    expect(result).toEqual({ bounced: 1, complained: 0 });
    expect(checkAndApplyAutoPause).toHaveBeenCalledWith("e1");
    expect(patchEngagementStack).toHaveBeenCalledTimes(1);
    const [id, patch] = patchEngagementStack.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(id).toBe("e1");
    expect(Object.keys(patch)).toEqual(["hubspot_delivery_poll_watermark_ms"]);
    // No whole-stack write-back anywhere in the pass.
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves the watermark where it was when the poll fails", async () => {
    pollDeliveryEvents.mockRejectedValue(new Error("HubSpot 502"));
    const result = await pollHubspotDeliveryForEngagement("e1");
    expect(result).toEqual({ bounced: 0, complained: 0 });
    expect(patchEngagementStack).not.toHaveBeenCalled();
  });
});
