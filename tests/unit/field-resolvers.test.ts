import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jev", () => ({ askJev: vi.fn() }));
vi.mock("@/lib/llm", () => ({ callClaude: vi.fn(), MODEL: { FAST: "fast" } }));
vi.mock("@/lib/client-facts", () => ({ getClientFact: vi.fn(), upsertClientFact: vi.fn() }));
vi.mock("@/lib/client-profile", () => ({ getPrimaryDomainForEngagement: vi.fn() }));

import { askJev } from "@/lib/jev";
import { callClaude } from "@/lib/llm";
import { getClientFact, upsertClientFact } from "@/lib/client-facts";
import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { resolveColdOpenDerivedFields, resolveDeepSiteReadings, verifyWebsiteReadings } from "@/lib/field-resolvers";

type Fact = { key: string; value: unknown; source: string; status: string; confidence: number | null };

function factStore(facts: Record<string, Partial<Fact>>) {
  vi.mocked(getClientFact).mockImplementation(async (_id: string, key: string) => {
    const f = facts[key];
    return f ? ({ key, source: "website", status: "suggested", confidence: null, sourceDetail: null, evidence: null, ...f } as any) : null;
  });
}

function upsertFor(key: string) {
  return vi.mocked(upsertClientFact).mock.calls.find((c) => c[1] === key);
}

const claudeJson = (obj: unknown) => vi.mocked(callClaude).mockResolvedValue({ text: JSON.stringify(obj) } as any);

describe("resolveColdOpenDerivedFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrimaryDomainForEngagement).mockResolvedValue("acme.com");
  });

  it("does nothing without a crawled corpus", async () => {
    factStore({});
    const result = await resolveColdOpenDerivedFields("e1");
    expect(result).toEqual({ resolved: [], skipped: true });
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("stores Jev's score as the confidence, never a fixed number", async () => {
    factStore({ rawVoiceCorpus: { value: "We help B2B SaaS founders book more demos. $499/mo." } });
    claudeJson({
      productName: "Acme Demos",
      productPrice: "$499/mo",
      productValueProp: "More booked demos for SaaS founders",
      icps: [{ slug: "b2b-saas-founders", label: "B2B SaaS Founders", weight: 1 }],
      greeting: "Hey {first_name},",
      signOff: "Cheers,",
    });
    vi.mocked(askJev).mockResolvedValue({
      model: "jev-latest",
      answers: {
        productIdentityVerification: { type: "score", score: 4, confidence: 0.9, legend: {}, probabilities: {} },
        icpsVerification: { type: "score", score: 2, confidence: 0.5, legend: {}, probabilities: {} },
        voiceTone: { type: "choice", choice: "Direct", confidence: 0.62, probabilities: {} },
      },
    } as any);

    const result = await resolveColdOpenDerivedFields("e1");

    expect(result.resolved.sort()).toEqual(["icps", "productIdentity", "voiceProfile"]);
    // 4/4 quality x 0.9 peakedness = 90
    expect(upsertFor("productIdentity")?.[3]).toMatchObject({ source: "jev", confidence: 90 });
    expect(upsertFor("productIdentity")?.[2]).toEqual({
      name: "Acme Demos",
      url: "https://acme.com",
      price: "$499/mo",
      valueProp: "More booked demos for SaaS founders",
    });
    // 2/4 quality x 0.5 peakedness = 25 — stays a suggestion (< 75)
    expect(upsertFor("icps")?.[3]).toMatchObject({ source: "jev", confidence: 25 });
    expect(upsertFor("voiceProfile")?.[3]).toMatchObject({ source: "jev", confidence: 62 });
    expect(upsertFor("voiceProfile")?.[2]).toEqual({ greeting: "Hey {first_name},", signOff: "Cheers,", tone: "Direct" });
  });

  it("writes no product identity when the name isn't found, instead of a placeholder", async () => {
    factStore({ rawVoiceCorpus: { value: "Some copy." } });
    claudeJson({ productName: null, productValueProp: "Something", icps: [] });
    vi.mocked(askJev).mockResolvedValue({
      model: "jev-latest",
      answers: { voiceTone: { type: "choice", choice: "Warm", confidence: 0.8, probabilities: {} } },
    } as any);

    await resolveColdOpenDerivedFields("e1");

    expect(upsertFor("productIdentity")).toBeUndefined();
    expect(upsertFor("icps")).toBeUndefined();
    const questions = vi.mocked(askJev).mock.calls[0][0].questions;
    expect(Object.keys(questions)).toEqual(["voiceTone"]);
  });

  it("writes no voice profile when Jev returns no tone, instead of a default tone", async () => {
    factStore({ rawVoiceCorpus: { value: "Some copy." } });
    claudeJson({ productName: null, icps: [] });
    vi.mocked(askJev).mockResolvedValue({ model: "jev-latest", answers: {} } as any);

    await resolveColdOpenDerivedFields("e1");

    expect(upsertFor("voiceProfile")).toBeUndefined();
  });

  it("leaves human-touched facts alone", async () => {
    factStore({
      rawVoiceCorpus: { value: "Some copy." },
      productIdentity: { status: "confirmed", value: {} },
      icps: { status: "edited", value: [] },
      voiceProfile: { status: "rejected", value: {} },
    });
    const result = await resolveColdOpenDerivedFields("e1");
    expect(result.skipped).toBe(true);
    expect(callClaude).not.toHaveBeenCalled();
    expect(upsertClientFact).not.toHaveBeenCalled();
  });

  it("keeps the extraction as an unscored suggestion when Jev returns no score", async () => {
    factStore({ rawVoiceCorpus: { value: "Copy" } });
    claudeJson({ productName: "Acme", productValueProp: "Value", icps: [] });
    vi.mocked(askJev).mockResolvedValue({ model: "jev-latest", answers: {} } as any);

    await resolveColdOpenDerivedFields("e1");

    expect(upsertFor("productIdentity")?.[3]).toMatchObject({ source: "jev", confidence: undefined });
  });
});

describe("resolveColdOpenDerivedFields sizing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrimaryDomainForEngagement).mockResolvedValue("acme.com");
  });

  it("maps Jev's size band to min/max, keeps copy-backed exclusions, and uses the weakest confidence", async () => {
    factStore({ rawVoiceCorpus: { value: "For agencies of 5-20 people. Not for freelancers." } });
    claudeJson({
      productName: "Acme",
      productValueProp: "Value",
      icps: [
        { slug: "small-agencies", label: "Small agencies", weight: 0.5, disqualifiers: ["Freelancers"] },
        { slug: "consultants", label: "Consultants", weight: 0.5, disqualifiers: [] },
      ],
    });
    vi.mocked(askJev).mockResolvedValue({
      model: "jev-latest",
      answers: {
        "teamSize_small-agencies": { type: "choice", choice: "2-10", confidence: 0.9, probabilities: {} },
        teamSize_consultants: { type: "choice", choice: "unclear", confidence: 0.7, probabilities: {} },
        disqualifiersVerification: { type: "score", score: 3, confidence: 0.8, legend: {}, probabilities: {} },
      },
    } as any);

    await resolveColdOpenDerivedFields("e1");

    const call = upsertFor("sizingBounds");
    expect(call?.[2]).toEqual({
      "small-agencies": { teamSizeMin: 2, teamSizeMax: 10, disqualifyIf: ["Freelancers"] },
      consultants: { disqualifyIf: [] },
    });
    // band 90, disqualifiers 3/4 x 0.8 = 60 -> the weaker, 60
    expect(call?.[3]).toMatchObject({ source: "jev", confidence: 60 });
  });

  it("proposes no sizing when the ICPs are already human-owned", async () => {
    factStore({ rawVoiceCorpus: { value: "Copy" }, icps: { status: "confirmed", value: [] } });
    claudeJson({ productName: null, icps: [] });
    vi.mocked(askJev).mockResolvedValue({ model: "jev-latest", answers: {} } as any);

    await resolveColdOpenDerivedFields("e1");
    expect(upsertFor("sizingBounds")).toBeUndefined();
  });
});

describe("verifyWebsiteReadings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scores unscored model readings and rewrites them with Jev's confidence", async () => {
    factStore({
      rawVoiceCorpus: { value: "Acme Coaching — the 12-week founder program, $2,000." },
      offerName: { source: "llm", value: "12-week founder program" },
      offerPrice: { source: "llm", value: "$2,000" },
      // Already scored or human-owned: not re-scored.
      operatorName: { source: "jev", value: "Acme Coaching" },
      offerIcp: { source: "llm", status: "confirmed", value: "Founders" },
      // A listed vertical from an account: not reclassified.
      offerVertical: { source: "account", value: "coaching_consulting" },
    });
    vi.mocked(askJev).mockResolvedValue({
      model: "jev-latest",
      answers: {
        offerNameVerification: { type: "score", score: 4, confidence: 0.8, legend: {}, probabilities: {} },
        offerPriceVerification: { type: "score", score: 1, confidence: 0.9, legend: {}, probabilities: {} },
      },
    } as any);

    const result = await verifyWebsiteReadings("e1");

    expect(result.verified.sort()).toEqual(["offerName", "offerPrice"]);
    expect(Object.keys(vi.mocked(askJev).mock.calls[0][0].questions).sort()).toEqual([
      "offerNameVerification",
      "offerPriceVerification",
    ]);
    expect(upsertFor("offerName")?.[3]).toMatchObject({ source: "jev", confidence: 80 });
    // 1/4 x 0.9 = 22.5 -> 23: below the auto-apply threshold
    expect(upsertFor("offerPrice")?.[3]).toMatchObject({ source: "jev", confidence: 23 });
  });

  it("classifies the vertical into the fixed list, replacing a free-text reading", async () => {
    factStore({ rawVoiceCorpus: { value: "We coach founders." }, offerVertical: { source: "llm", value: "business coaching" } });
    vi.mocked(askJev).mockResolvedValue({
      model: "jev-latest",
      answers: { offerVertical: { type: "choice", choice: "coaching_consulting", confidence: 0.83, probabilities: {} } },
    } as any);

    const result = await verifyWebsiteReadings("e1");

    const q = vi.mocked(askJev).mock.calls[0][0].questions.offerVertical as any;
    expect(q.type).toBe("choice");
    expect(Object.keys(q.criteria)).toContain("coaching_consulting");
    expect(result.verified).toEqual(["offerVertical"]);
    expect(upsertFor("offerVertical")?.[2]).toBe("coaching_consulting");
    expect(upsertFor("offerVertical")?.[3]).toMatchObject({ source: "jev", confidence: 83 });
  });

  it("leaves a listed vertical from a connected account alone", async () => {
    factStore({ rawVoiceCorpus: { value: "Copy" }, offerVertical: { source: "account", value: "ecommerce" } });
    const result = await verifyWebsiteReadings("e1");
    expect(result.skipped).toBe(true);
    expect(askJev).not.toHaveBeenCalled();
  });
});

describe("resolveDeepSiteReadings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scores objections, picks the main offer among tiers and the sales-call link among several", async () => {
    factStore({
      rawVoiceCorpus: { value: "site copy" },
      siteObjections: { value: ["Is it worth it?"], source: "llm" },
      offerTiers: { value: [{ name: "Starter", price: "$99" }, { name: "Scale Sprint", price: "$2,500" }], source: "llm" },
      bookingLinks: { value: [{ url: "https://calendly.com/a/support", platform: "calendly" }, { url: "https://calendly.com/a/strategy", platform: "calendly", event: "strategy" }] },
    });
    vi.mocked(askJev).mockResolvedValue({
      model: "jev-1",
      usage: { inputTokens: 1, outputTokens: 0 },
      costInCents: 0,
      answers: {
        objectionsVerification: { type: "score", score: 4, confidence: 0.9, legend: {}, probabilities: {} },
        mainOffer: { type: "choice", choice: "1", confidence: 0.8, probabilities: {} },
        salesCallLink: { type: "choice", choice: "1", confidence: 0.95, probabilities: {} },
      },
    } as any);

    await resolveDeepSiteReadings("e1");

    expect(upsertFor("siteObjections")?.[3]).toMatchObject({ source: "jev", confidence: 90 });
    expect(upsertFor("offerName")?.[2]).toBe("Scale Sprint");
    expect(upsertFor("offerPrice")?.[2]).toBe("$2,500");
    expect(upsertFor("salesCallBookingLink")?.[2]).toMatchObject({ url: "https://calendly.com/a/strategy" });
  });

  it("never re-picks an offer a person already settled, and takes a lone booking link as is", async () => {
    factStore({
      rawVoiceCorpus: { value: "site copy" },
      offerName: { value: "Mine", status: "confirmed" },
      offerTiers: { value: [{ name: "A" }, { name: "B" }], source: "llm" },
      bookingLinks: { value: [{ url: "https://calendly.com/a/strategy", platform: "calendly" }] },
    });
    await resolveDeepSiteReadings("e1");
    expect(askJev).not.toHaveBeenCalled();
    expect(upsertFor("offerName")).toBeUndefined();
    expect(upsertFor("salesCallBookingLink")?.[3]).toMatchObject({ source: "website" });
  });
});
