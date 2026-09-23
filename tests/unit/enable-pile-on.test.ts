import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/workspace", () => ({ getActiveWorkspace: vi.fn(), installPackageInWorkspace: vi.fn() }));
vi.mock("@/lib/engagement-skills", () => ({ setSkillEnabledForEngagement: vi.fn() }));
vi.mock("@/lib/product-onboarding", () => ({ isProductOnboarded: vi.fn() }));
vi.mock("@/lib/credentials", () => ({ hasCredential: vi.fn(), resolveCredential: vi.fn(), syncMarkersForChosenPlatforms: vi.fn() }));
vi.mock("@/lib/paste-key-harvest", () => ({ harvestTwilioA2PStatus: vi.fn() }));

import { db } from "@/lib/db";
import { installPackageInWorkspace } from "@/lib/workspace";
import { isProductOnboarded } from "@/lib/product-onboarding";
import { hasCredential, resolveCredential, syncMarkersForChosenPlatforms } from "@/lib/credentials";
import { harvestTwilioA2PStatus } from "@/lib/paste-key-harvest";
import { enablePileOnForEngagement } from "@/lib/enable-pile-on";
import { fakeDb } from "../helpers/fake-db";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("enablePileOnForEngagement", () => {
  let fake: ReturnType<typeof fakeDb>;
  beforeEach(() => {
    vi.clearAllMocks();
    fake = fakeDb([{ engagementId: "e1", stack: { sms_platform_meta: { twilio_from_number: "+15550000000" } } }]);
    Object.assign(db, fake);
    vi.mocked(isProductOnboarded).mockResolvedValue(true);
    vi.mocked(installPackageInWorkspace).mockResolvedValue({ ok: true } as any);
    vi.mocked(resolveCredential).mockResolvedValue("twilio-token");
    vi.mocked(harvestTwilioA2PStatus).mockResolvedValue([]);
  });

  it("syncs credential markers for the platforms just chosen", async () => {
    vi.mocked(hasCredential).mockResolvedValue(false);
    await enablePileOnForEngagement("u1", "ws-1", "e1", { smsPlatform: "twilio", adDataPlatform: "hyros" });
    expect(syncMarkersForChosenPlatforms).toHaveBeenCalledWith("e1", ["twilio", "hyros"]);
  });

  it("merges Twilio sending details over what's saved, ignoring blanks, and re-checks A2P status", async () => {
    vi.mocked(hasCredential).mockResolvedValue(true);
    await enablePileOnForEngagement("u1", "ws-1", "e1", {
      smsPlatform: "twilio",
      smsPlatformMeta: { twilio_account_sid: "AC1", twilio_messaging_service_sid: "MG1", twilio_from_number: "" },
    });
    await flush();

    const stack = fake.set.mock.calls[0][0].stack;
    expect(stack.sms_platform_meta).toEqual({ twilio_from_number: "+15550000000", twilio_account_sid: "AC1", twilio_messaging_service_sid: "MG1" });
    expect(harvestTwilioA2PStatus).toHaveBeenCalledWith("e1", "twilio-token");
  });
});
