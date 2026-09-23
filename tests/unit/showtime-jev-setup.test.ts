import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jev", () => ({ askJev: vi.fn() }));
vi.mock("@/lib/client-facts", () => ({ getClientFacts: vi.fn(), getClientFact: vi.fn(), upsertClientFact: vi.fn() }));
vi.mock("@/lib/credentials", () => ({ hasCredential: vi.fn(), resolveCredential: vi.fn() }));
vi.mock("@/lib/stack-options", () => ({ fetchStackOptions: vi.fn() }));

import { askJev } from "@/lib/jev";
import { getClientFact, getClientFacts, upsertClientFact } from "@/lib/client-facts";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { fetchStackOptions } from "@/lib/stack-options";
import { checkAccountMatches, checkSite, matchSavedConnection, pickShowtimeIds } from "@/lib/showtime-setup/jev-setup";
import { showtimePickTargets } from "@/lib/showtime-setup/picks";

function fact(key: string, value: unknown, source = "website", extra: Record<string, unknown> = {}) {
  return { key, value, source, sourceDetail: null, status: "suggested", confidence: null, evidence: null, updatedAt: new Date(), ...extra };
}

const LISTS = [
  { id: "L1", name: "Newsletter" },
  { id: "L2", name: "Booked calls" },
  { id: "L3", name: "No-shows recovery" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClientFacts).mockResolvedValue({ offerName: fact("offerName", "Growth Program") } as any);
  vi.mocked(hasCredential).mockResolvedValue(true);
  vi.mocked(resolveCredential).mockResolvedValue("pk_live");
  vi.mocked(fetchStackOptions).mockResolvedValue(LISTS);
});

describe("pickShowtimeIds", () => {
  it("asks Jev once per list and stores each pick with its confidence", async () => {
    vi.mocked(askJev).mockResolvedValue({
      model: "jev-1",
      usage: { inputTokens: 1, outputTokens: 0 },
      costInCents: 0,
      answers: {
        target_list_id: { type: "choice", choice: "L2", confidence: 0.82, probabilities: {} },
        recovery_list_id: { type: "choice", choice: "L3", confidence: 0.61, probabilities: {} },
      },
    });
    const targets = showtimePickTargets({ emailPlatform: "klaviyo", hostingPlatform: null });
    const results = await pickShowtimeIds("e1", "acme.com", targets);

    expect(fetchStackOptions).toHaveBeenCalledTimes(1);
    expect(askJev).toHaveBeenCalledTimes(1);
    const call = vi.mocked(askJev).mock.calls[0][0];
    expect(Object.keys(call.questions)).toEqual(["target_list_id", "recovery_list_id"]);
    expect((call.questions.target_list_id as { criteria: Record<string, string> }).criteria).toMatchObject({ L1: "Newsletter", __none__: expect.any(String) });

    expect(results).toEqual([
      { slot: "target_list_id", picked: LISTS[1], confidence: 82, noneFit: false },
      { slot: "recovery_list_id", picked: LISTS[2], confidence: 61, noneFit: false },
    ]);
    expect(upsertClientFact).toHaveBeenCalledWith(
      "e1",
      "pick:target_list_id",
      { id: "L2", name: "Booked calls", resource: "klaviyo-lists" },
      expect.objectContaining({ source: "jev", sourceDetail: "klaviyo", confidence: 82 })
    );
  });

  it("stores 'none fits' instead of guessing when Jev picks none", async () => {
    vi.mocked(askJev).mockResolvedValue({
      model: "jev-1",
      usage: { inputTokens: 1, outputTokens: 0 },
      costInCents: 0,
      answers: { recovery_workflow_id: { type: "choice", choice: "__none__", confidence: 0.9, probabilities: {} } },
    });
    const results = await pickShowtimeIds("e1", "acme.com", showtimePickTargets({ emailPlatform: "hubspot", hostingPlatform: null }));
    expect(results[0]).toMatchObject({ picked: null, noneFit: true });
    expect(upsertClientFact).toHaveBeenCalledWith("e1", "pick:recovery_workflow_id", { id: null, noneFit: true, resource: "hubspot-workflows" }, expect.anything());
  });

  it("skips a tool with no credential and never throws on a vendor error", async () => {
    vi.mocked(hasCredential).mockResolvedValueOnce(false);
    expect(await pickShowtimeIds("e1", "acme.com", showtimePickTargets({ emailPlatform: "klaviyo", hostingPlatform: null }))).toEqual([]);

    vi.mocked(fetchStackOptions).mockRejectedValueOnce(new Error("Klaviyo rejected the saved key [401]"));
    expect(await pickShowtimeIds("e1", "acme.com", showtimePickTargets({ emailPlatform: "klaviyo", hostingPlatform: null }))).toEqual([]);
    expect(askJev).not.toHaveBeenCalled();
    expect(upsertClientFact).not.toHaveBeenCalled();
  });
});

describe("checkSite", () => {
  it("flags copy that doesn't read like the business's own site", async () => {
    vi.mocked(getClientFact).mockResolvedValue(fact("rawVoiceCorpus", "Links: my podcast, my shop, my TikTok") as any);
    vi.mocked(askJev).mockResolvedValue({ model: "jev-1", usage: { inputTokens: 1, outputTokens: 0 }, costInCents: 0, answers: { isRealSite: { type: "noul", noul: 0.12 } } });
    expect(await checkSite("e1", "linktr.ee")).toEqual({ isRealSite: false, probability: 12 });
    expect(upsertClientFact).toHaveBeenCalledWith("e1", "siteCheck", { isRealSite: false, probability: 12 }, expect.objectContaining({ source: "jev" }));
  });

  it("says nothing when there's no copy to judge", async () => {
    vi.mocked(getClientFact).mockResolvedValue(null);
    expect(await checkSite("e1", "acme.com")).toBeNull();
    expect(askJev).not.toHaveBeenCalled();
  });
});

describe("checkAccountMatches", () => {
  it("only checks when the account told us who it belongs to", async () => {
    vi.mocked(getClientFacts).mockResolvedValue({ rawVoiceCorpus: fact("rawVoiceCorpus", "Acme coaching") } as any);
    expect(await checkAccountMatches("e1", "acme.com", "hubspot", null)).toBeNull();
    expect(askJev).not.toHaveBeenCalled();
  });

  it("flags an account that names a different business", async () => {
    vi.mocked(getClientFacts).mockResolvedValue({
      rawVoiceCorpus: fact("rawVoiceCorpus", "Acme coaching"),
      operatorName: fact("operatorName", "Zenith Dental", "account", { sourceDetail: "klaviyo" }),
    } as any);
    vi.mocked(askJev).mockResolvedValue({ model: "jev-1", usage: { inputTokens: 1, outputTokens: 0 }, costInCents: 0, answers: { sameBusiness: { type: "noul", noul: 0.08 } } });
    expect(await checkAccountMatches("e1", "acme.com", "klaviyo", null)).toEqual({ matches: false, probability: 8 });
  });
});

describe("matchSavedConnection", () => {
  it("does nothing with fewer than two saved connections", async () => {
    expect(await matchSavedConnection("e1", "acme.com", "hubspot", [{ id: "v1", label: "Acme" }])).toBeNull();
  });

  it("picks the saved connection whose label fits this client", async () => {
    vi.mocked(askJev).mockResolvedValue({ model: "jev-1", usage: { inputTokens: 1, outputTokens: 0 }, costInCents: 0, answers: { connection: { type: "choice", choice: "v2", confidence: 0.88, probabilities: {} } } });
    const match = await matchSavedConnection("e1", "acme.com", "hubspot", [
      { id: "v1", label: "Zenith Dental" },
      { id: "v2", label: "Acme Coaching HubSpot" },
    ]);
    expect(match).toEqual({ vaultId: "v2", confidence: 88 });
    expect(upsertClientFact).toHaveBeenCalledWith("e1", "vaultMatch:hubspot", "v2", expect.objectContaining({ confidence: 88 }));
  });
});
