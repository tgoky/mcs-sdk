import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jev", () => ({ askJev: vi.fn() }));
vi.mock("@/lib/credentials", () => ({ hasCredential: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() } }));

import { askJev } from "@/lib/jev";
import { hasCredential } from "@/lib/credentials";
import { suggestCampaignMap } from "@/features/cold-open/server/campaign-matching";
import { showtimeConnectionSuggestions } from "@/lib/derived-suggestions";
import { normalizeVertical, verticalLabel } from "@/lib/verticals";
import { computeBucketKey } from "@/features/leak-map/server/leak-map-benchmarks";

describe("suggestCampaignMap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only ever returns a real campaign from the list, and skips 'none of these'", async () => {
    vi.mocked(askJev).mockResolvedValue({
      model: "jev-latest",
      answers: {
        saas: { type: "choice", choice: "c2", confidence: 0.86, probabilities: {} },
        agencies: { type: "choice", choice: "__none__", confidence: 0.7, probabilities: {} },
        coaches: { type: "choice", choice: "made-up-id", confidence: 0.9, probabilities: {} },
      },
    } as any);

    const map = await suggestCampaignMap(
      [
        { slug: "saas", label: "SaaS founders" },
        { slug: "agencies", label: "Agencies" },
        { slug: "coaches", label: "Coaches" },
      ],
      [
        { id: "c1", name: "Q3 Ecommerce push" },
        { id: "c2", name: "SaaS Founders — demo ask" },
      ]
    );

    expect(map).toEqual({ saas: { campaignId: "c2", campaignName: "SaaS Founders — demo ask", confidence: 86 } });
    const criteria = (vi.mocked(askJev).mock.calls[0][0].questions.saas as any).criteria;
    expect(Object.keys(criteria)).toEqual(["c1", "c2", "__none__"]);
  });

  it("doesn't call Jev with nothing to match", async () => {
    expect(await suggestCampaignMap([], [{ id: "c1", name: "x" }])).toEqual({});
    expect(await suggestCampaignMap([{ slug: "a", label: "A" }], [])).toEqual({});
    expect(askJev).not.toHaveBeenCalled();
  });
});

describe("showtimeConnectionSuggestions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("suggests only options the connected tools can deliver, and only for unset fields", async () => {
    vi.mocked(hasCredential).mockResolvedValue(false);
    const s = await showtimeConnectionSuggestions("e1", { email_platform: "hubspot", hero_video_id: "https://fast.wistia.net/embed/iframe/x" } as any);
    expect(s.smsPlatform?.value).toBe("hubspot_sms");
    expect(s.adDataPlatform?.value).toBe("native_crm");
    expect(s.briefLandingDestination?.value).toBe("crm_note");
    expect(s.videoEngagementPlatform?.value).toBe("wistia");
  });

  it("prefers a connected Twilio key for SMS and leaves chosen fields alone", async () => {
    vi.mocked(hasCredential).mockImplementation(async (_id, provider) => provider === "twilio");
    const s = await showtimeConnectionSuggestions("e1", {
      email_platform: "ghl",
      ad_data_platform: "none",
      brief_landing_destination: "slack",
    } as any);
    expect(s.smsPlatform?.value).toBe("twilio");
    expect(s.adDataPlatform).toBeUndefined();
    expect(s.briefLandingDestination).toBeUndefined();
  });

  it("never suggests a CRM note for a CRM that can't receive one", async () => {
    vi.mocked(hasCredential).mockResolvedValue(false);
    const s = await showtimeConnectionSuggestions("e1", { email_platform: "mailchimp" } as any);
    expect(s.briefLandingDestination).toBeUndefined();
    expect(s.adDataPlatform).toBeUndefined();
  });
});

describe("verticals", () => {
  it("maps common spellings onto one id and shows its label", () => {
    expect(normalizeVertical("Business Coaching")).toBe("coaching_consulting");
    expect(normalizeVertical("coaching_consulting")).toBe("coaching_consulting");
    expect(normalizeVertical("underwater basket weaving")).toBeNull();
    expect(verticalLabel("coaching_consulting")).toBe("Coaching & consulting");
    expect(verticalLabel("underwater basket weaving")).toBe("underwater basket weaving");
  });

  it("puts 'coaching' and 'business coaching' in the same Leak Map benchmark group", () => {
    const a = computeBucketKey({ traffic_temperature: "warm", price: "$2,000", vertical: "coaching" });
    const b = computeBucketKey({ traffic_temperature: "warm", price: "$2,000", vertical: "Business coaching" });
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});
