import { describe, it, expect, vi } from "vitest";

// proposal.ts imports the subject validator only; state.ts (via save.ts)
// pulls the database, so it's stubbed for the parser tests.
vi.mock("@/lib/db", () => ({ db: {} }));

import type { ClientFact } from "@/lib/client-facts";
import { buildColdOpenProposal, greetingWord, icpEvidence, siteUrl, type ProposalInput, type SavedColdOpen } from "@/lib/cold-open-setup/proposal";
import { parseColdOpenSetup, slugify } from "@/lib/cold-open-setup/save";
import { summarizeOutbound } from "@/lib/cold-open-setup/outbound";
import type { BuyerProfile } from "@/lib/cold-open-setup/analyze";
import type { SenderIntel } from "@/lib/cold-open-setup/sender";

const fact = (value: unknown, status: ClientFact["status"] = "suggested"): ClientFact => ({ key: "k", value, source: "website", sourceDetail: null, status, confidence: 80, evidence: null, updatedAt: new Date(0) });

const facts: Record<string, ClientFact> = {
  productIdentity: fact({ name: "Acme Audit", url: "https://acme.io", price: "$2k", valueProp: "Finds leaks in your funnel" }),
  icps: fact([
    { slug: "agencies", label: "Marketing agencies", weight: 0.6 },
    { slug: "saas", label: "B2B SaaS", weight: 0.4 },
  ]),
  sizingBounds: fact({ agencies: { disqualifyIf: [] }, saas: { teamSizeMin: 20, teamSizeMax: 200, disqualifyIf: ["public company"] } }),
  voiceProfile: fact({ greeting: "Hey", signOff: "Cheers", tone: "Plain and friendly" }),
};

const body = (text: string) => `<p>${text}</p>`;
const sender: SenderIntel = {
  platform: "instantly",
  pulledAt: "2026-09-01T00:00:00Z",
  coverage: { read: [], blocked: [], failed: [] },
  campaigns: [
    { id: "c1", name: "Agencies Q3", status: null, sent: 400, opens: null, replies: 20, bounces: null },
    { id: "c2", name: "SaaS founders", status: null, sent: 1000, opens: null, replies: 10, bounces: null },
  ],
  steps: [
    { campaignId: "c1", campaignName: "Agencies Q3", step: 1, subject: "idea for {{company}}", body: body("Hi {{firstName}},<br>Saw your site.<br>Best,<br>Sam") },
    { campaignId: "c1", campaignName: "Agencies Q3", step: 2, subject: "", body: body("Any thoughts?") },
    { campaignId: "c2", campaignName: "SaaS founders", step: 1, subject: "Hey {{firstName}}!", body: body("Hi {{firstName}},<br>Quick question.<br>Best,<br>Sam") },
    { campaignId: "c2", campaignName: "SaaS founders", step: 2, subject: "", body: body("Bumping this for {{firstName}}") },
  ],
  mailboxes: [
    { email: "sam@acmemail.io", fromName: "Sam", dailyLimit: 30, warmupStatus: null, health: 95, broken: false },
    { email: "sam@acme-hq.io", fromName: "Sam", dailyLimit: 30, warmupStatus: null, health: 40, broken: false },
    { email: "sam@gmail.com", fromName: "Sam", dailyLimit: 30, warmupStatus: null, health: null, broken: false },
  ],
  timezone: "America/Chicago",
};

const buyers: BuyerProfile = {
  wonDeals: 12,
  companies: 10,
  industries: [{ industry: "Marketing and Advertising", count: 7 }],
  sizes: [],
  sweetSpot: { min: 11, max: 50, share: 80 },
  examples: [],
};

const input = (over: Partial<ProposalInput> = {}): ProposalInput => ({
  domain: "acme.io",
  saved: null,
  facts,
  sender,
  buyers,
  campaignMatch: { agencies: { id: "c1", confidence: 90 }, saas: { id: "c2", confidence: 50 } },
  clientTimezone: "Europe/London",
  tierOf: (f) => (f?.status === "confirmed" ? "done" : f ? "likely" : "ask"),
  platformLabel: () => "Instantly",
  ...over,
});

describe("buildColdOpenProposal", () => {
  it("builds from the site, the sending platform, the CRM and Jev", () => {
    const p = buildColdOpenProposal(input());
    expect(p.product.name).toEqual({ value: "Acme Audit", tier: "likely", source: "your website" });
    // The greeting their sent emails actually use beats the site's guess.
    expect(p.voice.greeting).toMatchObject({ value: "Hi", source: "your Instantly emails", tier: "done" });
    expect(p.voice.signOff.value).toBe("Best");
    // Only subjects Cold Open can fill, in its token format.
    expect(p.subjects.map((s) => s.value)).toEqual(["idea for {company_name}"]);
    // The agencies sequence reads without unfillable fields; SaaS's doesn't.
    expect(p.touchsets).toHaveLength(1);
    expect(p.touchsets[0]).toMatchObject({ subject: "idea for {company_name}", body1: "Saw your site.", campaign: "Agencies Q3" });
    expect(p.touchsetsDropped).toBe(1);
    expect(p.platform).toBe("instantly");
  });

  it("sizes an ICP from won deals only when the site gave no range", () => {
    const p = buildColdOpenProposal(input());
    const agencies = p.icps.find((i) => i.slug === "agencies")!;
    expect([agencies.teamSizeMin, agencies.teamSizeMax]).toEqual([11, 50]);
    expect(agencies.evidence).toContain("7 of your 10 won customers are in Marketing and Advertising");
    const saas = p.icps.find((i) => i.slug === "saas")!;
    expect([saas.teamSizeMin, saas.teamSizeMax]).toEqual([20, 200]);
    expect(saas.disqualifyIf).toEqual(["public company"]);
  });

  it("maps campaigns by Jev's confidence", () => {
    const p = buildColdOpenProposal(input());
    expect(p.campaignMap.agencies).toEqual({ id: "c1", name: "Agencies Q3", tier: "done" });
    expect(p.campaignMap.saas).toEqual({ id: "c2", name: "SaaS founders", tier: "likely" });
  });

  it("keeps daily volume to a third of healthy mailbox capacity, and never proposes live sending", () => {
    const p = buildColdOpenProposal(input());
    // 30 + 30 healthy (gmail's health unknown counts; the 40-health one doesn't).
    expect(p.daily.volume).toBe(20);
    expect(p.daily.liveSendEnabled).toBe(false);
    expect(p.daily.timezone).toBe("America/Chicago");
    expect(p.daily.copyMode).toBe("generate");
  });

  it("lets every saved value win, including live sending", () => {
    const saved: SavedColdOpen = {
      productIdentity: { name: "Saved Name", url: "https://saved.io", price: "", valueProp: "Saved prop" },
      icps: [{ slug: "only", label: "Only group", weight: 1 }],
      sizingBounds: { only: { teamSizeMin: 5, disqualifyIf: [] } },
      voiceProfile: { greeting: "Hello", signOff: "Thanks", tone: "Warm" },
      subjectVariants: ["one", "two", "three"],
      bodyVariantPools: { default: [{ subject: "s", body1: "a", body2: "b", body3: "c" }] },
      sendPlatform: { platform: "smartlead" },
      campaignMap: { only: "c2" },
      dailySendSettings: { volume: 7, localHour: 8, copyMode: "upload", liveSendEnabled: true },
    };
    const p = buildColdOpenProposal(input({ saved }));
    expect(p.product.name).toEqual({ value: "Saved Name", tier: "done", source: "saved" });
    expect(p.icps.map((i) => i.slug)).toEqual(["only"]);
    expect(p.icps[0].teamSizeMax).toBeNull();
    expect(p.voice.greeting.value).toBe("Hello");
    expect(p.subjects.map((s) => s.value)).toEqual(["one", "two", "three"]);
    expect(p.touchsets.map((t) => t.campaign)).toEqual(["saved"]);
    expect(p.campaignMap.only).toEqual({ id: "c2", name: "SaaS founders", tier: "done" });
    expect(p.platform).toBe("smartlead");
    expect(p.daily).toMatchObject({ volume: 7, liveSendEnabled: true, volumeSource: "saved" });
  });

  it("works with only a website", () => {
    const p = buildColdOpenProposal(input({ sender: null, buyers: null, campaignMatch: null }));
    expect(p.voice.greeting).toMatchObject({ value: "Hey", source: "your website" });
    expect(p.subjects).toEqual([]);
    expect(p.campaignMap).toEqual({ agencies: null, saas: null });
    expect(p.daily).toMatchObject({ volume: 20, timezone: "Europe/London", volumeSource: "a careful starting point" });
  });

  it("fills a website-only setup from Showtime when the site read found nothing", () => {
    const p = buildColdOpenProposal(
      input({
        domain: "https://muddventures.com/",
        facts: {},
        sender: null,
        buyers: null,
        campaignMatch: null,
        showtimeOffer: { name: "AI Clarity Call", price: "$500", icp: "Agency owners", vertical: "Marketing" },
      })
    );
    expect(p.product.name).toEqual({ value: "AI Clarity Call", tier: "done", source: "your Showtime setup" });
    expect(p.product.price.value).toBe("$500");
    expect(p.product.valueProp).toMatchObject({ value: "AI Clarity Call for Agency owners", tier: "likely" });
    // The saved domain had its own https://; it isn't doubled.
    expect(p.product.url.value).toBe("https://muddventures.com");
    expect(p.icps).toMatchObject([{ slug: "agency-owners", label: "Agency owners", weight: 1, tier: "likely", evidence: "From your Showtime setup (Marketing)" }]);
    // Nothing read for the voice: plain defaults, shown as guesses to check.
    expect(p.voice.greeting).toEqual({ value: "Hi", tier: "likely", source: "a common default" });
    expect(p.voice.signOff.value).toBe("Best,");
    expect(p.voice.tone.value).toBe("Plain and friendly");
  });

  it("keeps the greeting to the word Cold Open puts the first name after", () => {
    expect(greetingWord("Hi {first_name},")).toBe("Hi");
    expect(greetingWord("Hey {{firstName}}!")).toBe("Hey");
    expect(siteUrl("muddventures.com/")).toBe("https://muddventures.com");
    expect(siteUrl("https://www.muddventures.com/about/")).toBe("https://muddventures.com/about");
    const p = buildColdOpenProposal(input({ sender: null, facts: { ...facts, voiceProfile: fact({ greeting: "Hi {first_name},", signOff: "Cheers", tone: "Warm" }) } }));
    expect(p.voice.greeting.value).toBe("Hi");
  });

  it("ignores rejected facts", () => {
    const p = buildColdOpenProposal(input({ facts: { ...facts, productIdentity: fact({ name: "Nope" }, "rejected") } }));
    expect(p.product.name.value).toBe("");
    expect(p.product.url.value).toBe("https://acme.io");
  });

  it("only claims industry evidence when words match", () => {
    expect(icpEvidence("Dental clinics", buyers)).toBeNull();
    expect(icpEvidence("Anything", null)).toBeNull();
  });
});

describe("parseColdOpenSetup", () => {
  const good = {
    product: { name: " Acme ", url: "https://acme.io", price: "", valueProp: "Finds leaks" },
    icps: [
      { slug: "agencies", label: "Agencies", weight: 60, teamSizeMin: 10, teamSizeMax: 50, disqualifyIf: ["x", ""] },
      { slug: "", label: "B2B SaaS!", weight: 40 },
      { slug: "", label: "B2B SaaS!", weight: 0 },
      { label: "  " },
    ],
    voice: { greeting: "Hi", signOff: "Best", tone: "Plain" },
    subjects: ["a", 3, "b"],
    touchsets: [{ subject: "s", body1: "one", body2: "two", body3: "three" }, { subject: "", body1: "x" }],
    platform: "instantly",
    campaignMap: { agencies: "c1", ghost: "c9", "b2b-saas": "" },
    daily: { volume: 25, localHour: 9, timezone: "", copyMode: "upload" },
    skills: ["daily-send"],
  };

  it("cleans the body, slugs new groups and scales shares to 1", () => {
    const r = parseColdOpenSetup(good);
    if ("error" in r) throw new Error(r.error);
    expect(r.product.name).toBe("Acme");
    expect(r.icps.map((i) => i.slug)).toEqual(["agencies", "b2b-saas", "b2b-saas-2"]);
    expect(r.icps.map((i) => i.weight)).toEqual([0.6, 0.4, 0]);
    expect(r.icps[0].disqualifyIf).toEqual(["x"]);
    expect(r.subjects).toEqual(["a", "b"]);
    expect(r.touchsets).toHaveLength(1);
    expect(r.campaignMap).toEqual({ agencies: "c1" });
    expect(r.daily).toEqual({ volume: 25, localHour: 9, timezone: null, copyMode: "upload" });
  });

  it("splits shares evenly when none were given, and rejects a bad platform", () => {
    const r = parseColdOpenSetup({ ...good, icps: [{ label: "A" }, { label: "B" }], platform: "mailchimp" });
    if ("error" in r) throw new Error(r.error);
    expect(r.icps.map((i) => i.weight)).toEqual([0.5, 0.5]);
    expect(r.platform).toBeNull();
  });

  it("refuses an upside-down team size range", () => {
    expect(parseColdOpenSetup({ ...good, icps: [{ label: "A", teamSizeMin: 50, teamSizeMax: 10 }] })).toEqual({ error: '"A": the smallest team size is bigger than the largest.' });
    expect(parseColdOpenSetup(null)).toEqual({ error: "Invalid request body." });
  });

  it("slugify", () => {
    expect(slugify("  Marketing Agencies (US) ")).toBe("marketing-agencies-us");
    expect(slugify("!!!")).toBe("icp");
  });
});

describe("summarizeOutbound", () => {
  it("checks only the client's own sending domains and reports warnings as problems", async () => {
    const checked: string[] = [];
    const out = await summarizeOutbound(sender, async (d) => {
      checked.push(d);
      return d === "acme-hq.io" ? [{ severity: "warn", code: "NO_DMARC", message: "no DMARC record." }, { severity: "info", code: "X", message: "fine" }] : [];
    });
    expect(checked.sort()).toEqual(["acme-hq.io", "acmemail.io"]);
    expect(out.domains).toEqual(
      expect.arrayContaining([
        { domain: "acme-hq.io", ok: false, problems: ["no DMARC record."] },
        { domain: "acmemail.io", ok: true, problems: [] },
      ])
    );
    expect(out.capacity).toBe(60);
    expect(out.suggestedVolume).toBe(20);
    expect(out.campaigns.map((c) => [c.id, c.replyRate])).toEqual([
      ["c1", 5],
      ["c2", 1],
    ]);
  });
});
