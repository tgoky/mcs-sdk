import { describe, it, expect, vi, beforeEach } from "vitest";

const callClaudeWithWebSearch = vi.fn();
vi.mock("@/lib/llm", () => ({ callClaudeWithWebSearch: (...a: unknown[]) => callClaudeWithWebSearch(...a) }));
const askJev = vi.fn();
vi.mock("@/lib/jev", () => ({ askJev: (...a: unknown[]) => askJev(...a) }));
const getClientFact = vi.fn();
const upsertClientFact = vi.fn(async () => undefined);
vi.mock("@/lib/client-facts", () => ({
  getClientFact: (...a: unknown[]) => getClientFact(...a),
  upsertClientFact: (...a: unknown[]) => (upsertClientFact as (...x: unknown[]) => Promise<void>)(...a),
}));

import { findWebCompetitors, vetCandidates, WEB_COMPETITORS_FACT } from "@/lib/rep-setup/competitor-search";

const reply = (competitors: unknown[], citedUrls: string[]) => ({
  text: "Here you go:\n```json\n" + JSON.stringify({ competitors }) + "\n```",
  citedUrls,
  searchesUsed: 3,
});

describe("vetCandidates", () => {
  const self = { business: "Acme Coaching", domain: "acmecoaching.com" };
  it("keeps only names found on a page the search returned, and never the business itself", () => {
    const out = vetCandidates(
      [
        { name: "Bolt Coaching", url: "https://bolt.co", sourceUrl: "https://www.g2.com/acme-alternatives", why: "" },
        { name: "Invented Co", url: null, sourceUrl: "https://nowhere.example/x", why: "" },
        { name: "Acme Coaching", url: "https://acmecoaching.com", sourceUrl: "https://g2.com/x", why: "" },
        { name: "Acme Two", url: "https://www.acmecoaching.com/two", sourceUrl: "https://g2.com/x", why: "" },
        { name: "bolt coaching", url: null, sourceUrl: "https://g2.com/y", why: "" },
      ],
      ["https://g2.com/acme-alternatives?ref=1"],
      self
    );
    expect(out.map((c) => c.name)).toEqual(["Bolt Coaching"]);
  });

  it("still needs a real source address when the provider returns no citations", () => {
    const out = vetCandidates([{ name: "Bolt", url: null, sourceUrl: "https://bolt.co/vs-acme", why: "" }, { name: "Nope", url: null, sourceUrl: "not a url", why: "" }], [], self);
    expect(out.map((c) => c.name)).toEqual(["Bolt"]);
  });
});

describe("findWebCompetitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientFact.mockResolvedValue(null);
  });

  it("keeps the names Jev says compete, each with its own confidence, and trusts the list only as far as the weakest", async () => {
    callClaudeWithWebSearch.mockResolvedValue(
      reply(
        [
          { name: "Bolt Coaching", url: "https://bolt.co", sourceUrl: "https://g2.com/a", why: "Same buyers" },
          { name: "Big Directory", url: null, sourceUrl: "https://g2.com/b", why: "Lists coaches" },
          { name: "Peak Coaching", url: null, sourceUrl: "https://g2.com/c", why: "Same offer" },
        ],
        ["https://g2.com/a"]
      )
    );
    askJev.mockResolvedValue({ model: "jev-1.13.0", answers: { c0: { type: "noul", noul: 0.9 }, c1: { type: "noul", noul: 0.2 }, c2: { type: "noul", noul: 0.6 } } });

    const out = await findWebCompetitors("e1", { business: "Acme", domain: "acme.com", category: "Business coach" });

    expect(out).toEqual({ status: "found", count: 2 });
    const [, key, value, opts] = upsertClientFact.mock.calls[0] as unknown as [string, string, { name: string; confidence: number }[], { confidence?: number; sourceDetail: string }];
    expect(key).toBe(WEB_COMPETITORS_FACT);
    expect(value.map((c) => [c.name, c.confidence])).toEqual([
      ["Bolt Coaching", 90],
      ["Peak Coaching", 60],
    ]);
    expect(opts.confidence).toBe(60);
    expect(opts.sourceDetail).toBe("web_search");
  });

  it("keeps the vetted names unscored when Jev can't answer, so they show as unsure", async () => {
    callClaudeWithWebSearch.mockResolvedValue(reply([{ name: "Bolt", url: null, sourceUrl: "https://g2.com/a", why: "" }], ["https://g2.com/a"]));
    askJev.mockRejectedValue(new Error("Jev down"));
    expect(await findWebCompetitors("e1", { business: "Acme", domain: "acme.com" })).toEqual({ status: "found", count: 1 });
    const [, , value, opts] = upsertClientFact.mock.calls[0] as unknown as [string, string, { confidence: number | null }[], { confidence?: number }];
    expect(value[0].confidence).toBeNull();
    expect(opts.confidence).toBeUndefined();
  });

  it("reuses a recent search unless asked to search again, and survives the search failing", async () => {
    getClientFact.mockResolvedValue({ status: "suggested", value: [{ name: "Bolt" }], updatedAt: new Date() });
    expect(await findWebCompetitors("e1", { business: "Acme", domain: "acme.com" })).toEqual({ status: "reused", count: 1 });
    expect(callClaudeWithWebSearch).not.toHaveBeenCalled();

    callClaudeWithWebSearch.mockRejectedValue(new Error("OpenRouter 500"));
    expect((await findWebCompetitors("e1", { business: "Acme", domain: "acme.com", force: true })).status).toBe("failed");
  });
});
