import { describe, it, expect } from "vitest";
import { buildRepProposal, emailDomain, normalizeHandles, notableHosts, type ProposalInput, type SavedGraph } from "@/lib/rep-setup/proposal";
import type { ClientFact } from "@/lib/client-facts";
import type { TrustTier } from "@/lib/fact-trust";

const fact = (key: string, value: unknown, extra: Partial<ClientFact> = {}): ClientFact => ({
  key,
  value,
  source: "website",
  sourceDetail: null,
  status: "suggested",
  confidence: null,
  evidence: null,
  updatedAt: new Date("2026-09-01"),
  ...extra,
});
const facts = (...fs: ClientFact[]) => Object.fromEntries(fs.map((f) => [f.key, f]));
const base = (over: Partial<ProposalInput> = {}): ProposalInput => ({
  buyer: "Acme Client",
  primaryDomain: "acme.com",
  saved: null,
  facts: {},
  decisions: null,
  tierOf: (f) => (f ? ("likely" as TrustTier) : "ask"),
  toolLabel: (p) => ({ calendly: "Calendly", klaviyo: "Klaviyo", ghl_calendar: "GoHighLevel" })[p] ?? p,
  ...over,
});

describe("helpers", () => {
  it("keeps a business sending domain and drops free mail", () => {
    expect(emailDomain("hello@mail.acme.com")).toBe("acme.com");
    expect(emailDomain("jane@acme.io")).toBe("acme.io");
    expect(emailDomain("acme.founder@gmail.com")).toBeNull();
  });
  it("gives X Watch the handle under 'x', with an @", () => {
    expect(normalizeHandles({ twitter: "@acmehq", instagram: "https://instagram.com/acme.co/", linkedin: "https://linkedin.com/company/acme" })).toEqual({
      x: "@acmehq",
      instagram: "@acme.co",
      linkedin: "https://linkedin.com/company/acme",
    });
  });
  it("counts only hosts who take a real share of calls", () => {
    expect(notableHosts([{ name: "Jane", count: 40 }, { name: "Sam", count: 12 }, { name: "Temp", count: 2 }], 54)).toEqual(["Jane", "Sam"]);
  });
});

describe("buildRepProposal", () => {
  it("gathers names from the site and connected tools, each with where it came from", () => {
    const p = buildRepProposal(
      base({
        facts: facts(
          fact("operatorName", "Acme"),
          fact("founder", { name: "Jane Doe", role: "Founder" }),
          fact("socialProfiles", { twitter: "@acmehq" }),
          fact("contactInfo", { emails: ["hello@acme.com", "no-reply@acme.com"] }),
          fact("offerTiers", [{ name: "Acme Accelerator", price: "$2k" }]),
          fact("whopPlanOptions", [{ name: "Acme VIP", price: "$99" }], { source: "account" }),
          fact("pressMentions", ["Forbes"]),
          fact("accountIntel:calendly", {
            provider: "calendly",
            booking: { history: { total: 50, hosts: [{ name: "Sam Closer", count: 30 }, { name: "Jane Doe", count: 18 }] } },
          }, { source: "account" }),
          fact("accountIntel:klaviyo", { provider: "klaviyo", sender: { fromName: "Acme Team", fromEmail: "team@send.acme.com" }, business: { website: "https://acme.io" } }, { source: "account" })
        ),
      })
    );
    expect(p.operatorName.value).toBe("Acme");
    const alias = (v: string) => p.aliases.find((a) => a.value === v);
    expect(alias("Jane Doe")?.sources).toEqual(["your website", "Calendly"]);
    expect(alias("Sam Closer")?.sources).toEqual(["Calendly"]);
    expect(alias("Acme Team")?.sources).toEqual(["Klaviyo"]);
    expect(p.domains.map((d) => d.value)).toEqual(["acme.com", "acme.io"]);
    expect(p.emailContacts.map((e) => e.value)).toEqual(["hello@acme.com", "team@send.acme.com"]);
    expect(p.handles).toEqual([{ platform: "x", handle: "@acmehq", sources: ["your website"], tier: "done", on: true }]);
    expect(p.offerings.map((o) => [o.value, o.sources])).toEqual([
      ["Acme Accelerator", ["your website"]],
      ["Acme VIP", ["Whop"]],
    ]);
    expect(p.trustedSources.map((t) => t.value)).toEqual(["Forbes"]);
    // The business itself is always the first, starred brand.
    expect(p.entities[0]).toMatchObject({ value: "Acme", type: "company", highPriority: true });
  });

  it("never fills in the crisis contact, only suggests the founder", () => {
    const p = buildRepProposal(base({ facts: facts(fact("founder", { name: "Jane Doe", role: "CEO" })) }));
    expect(p.soleAuthority).toEqual({ saved: null, suggestion: { name: "Jane Doe", role: "CEO", source: "your website" } });
  });

  it("lets Jev switch off a name that isn't really theirs, and keep a real lookalike", () => {
    const p = buildRepProposal(
      base({
        facts: facts(
          fact("accountIntel:calendly", { provider: "calendly", booking: { history: { total: 20, hosts: [{ name: "Scheduler Bot", count: 20 }] } } }, { source: "account" }),
          fact("collisions", [{ name: "Acme Anvils", domain: "acmeanvils.com" }, { name: "Acme Blog", domain: "blog.acme.com" }])
        ),
        decisions: {
          aliases: { "scheduler bot": { keep: false, confidence: 90 } },
          collisions: { "acme anvils": { keep: true, confidence: 88 }, "acme blog": { keep: false, confidence: 80 } },
        },
      })
    );
    expect(p.aliases.find((a) => a.value === "Scheduler Bot")).toMatchObject({ tier: "ask", on: false });
    expect(p.collisions.map((c) => [c.name, c.on])).toEqual([
      ["Acme Anvils", true],
      ["Acme Blog", false],
    ]);
    expect(p.collisions[0].whoTheyAre).toBe("Runs acmeanvils.com");
  });

  it("puts what's saved first and marks it done", () => {
    const saved: SavedGraph = {
      operatorName: "Acme Ltd",
      operatorAliases: ["ACME"],
      operatorHandles: { x: "@acme" },
      operatorDomains: ["acme.com"],
      operatorEmailContacts: [],
      entities: [{ name: "Acme Ltd", aliases: [], type: "company", domainsOwned: [], handles: {}, highPriority: true }],
      offerings: [],
      competitors: [{ name: "Globex", monitorFor: [], highPriority: false }],
      collisions: [],
      trustedSources: [],
      seedPanelPrompts: ["Is Acme legit?"],
      soleAuthorityName: "Jane",
      googleListing: { placeId: "ChIJ", name: "Acme Ltd" },
    };
    const p = buildRepProposal(base({ saved, facts: facts(fact("operatorName", "Something Else"), fact("competitors", ["Initech"])) }));
    expect(p.operatorName).toEqual({ value: "Acme Ltd", tier: "done", source: "saved" });
    expect(p.aliases[0]).toMatchObject({ value: "ACME", tier: "done", on: true });
    expect(p.competitors.map((c) => c.value)).toEqual(["Globex"]);
    expect(p.soleAuthority.saved).toBe("Jane");
    expect(p.googleListing).toEqual({ listing: { placeId: "ChIJ", name: "Acme Ltd" }, saved: true });
  });
});

describe("competitors from the web, and the CRM's own address", () => {
  it("lists web-found competitors after the site's, each by its own confidence", () => {
    const p = buildRepProposal(
      base({
        facts: facts(
          fact("competitors", ["SiteRival"]),
          fact("webCompetitors", [
            { name: "Bolt Coaching", url: null, sourceUrl: "https://g2.com/a", why: "", confidence: 92 },
            { name: "Maybe Co", url: null, sourceUrl: "https://g2.com/b", why: "", confidence: 50 },
            { name: "Unscored", url: null, sourceUrl: "https://g2.com/c", why: "", confidence: null },
          ], { source: "jev", sourceDetail: "web_search" })
        ),
      })
    );
    const byName = Object.fromEntries(p.competitors.map((c) => [c.value, c]));
    expect(p.competitors.map((c) => c.value)).toEqual(["SiteRival", "Bolt Coaching", "Maybe Co", "Unscored"]);
    expect(byName["Bolt Coaching"]).toMatchObject({ tier: "done", on: true, sources: ["the web"] });
    expect(byName["Maybe Co"].tier).toBe("likely");
    // Nobody vouched for it: shown, but switched off until someone does.
    expect(byName["Unscored"]).toMatchObject({ tier: "ask", on: false });
  });

  it("ignores web competitors once competitors are saved", () => {
    const saved = { operatorName: "Acme", competitors: [{ name: "Chosen", monitorFor: [], highPriority: false }] } as unknown as SavedGraph;
    const p = buildRepProposal(base({ saved, facts: facts(fact("webCompetitors", [{ name: "Bolt", sourceUrl: "https://g2.com/a", confidence: 90 }])) }));
    expect(p.competitors.map((c) => c.value)).toEqual(["Chosen"]);
  });

  it("offers the business email a connected tool has on file", () => {
    const p = buildRepProposal(
      base({ facts: facts(fact("accountIntel:hubspot", { provider: "hubspot", business: { name: "Acme", email: "Hello@Acme.com" } }, { source: "account" })) })
    );
    expect(p.emailContacts.map((e) => e.value)).toContain("hello@acme.com");
  });
});
