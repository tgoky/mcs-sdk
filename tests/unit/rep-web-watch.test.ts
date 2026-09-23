import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/llm", () => ({ callClaude: vi.fn() }));

import { searchQueries, watchNames, whoOf } from "@/features/reputation-manager/server/web-watch-service";

const graph = {
  operatorName: "Acme",
  operatorAliases: ["Jane Doe"],
  operatorDomains: ["acme.com"],
  entities: [
    { name: "Acme", aliases: [], type: "company" as const, domainsOwned: [], handles: {}, highPriority: true },
    { name: "Acme Labs", aliases: [], type: "brand" as const, domainsOwned: [], handles: {}, highPriority: true },
    { name: "Footer Link", aliases: [], type: "brand" as const, domainsOwned: [], handles: {}, highPriority: false },
  ],
  offerings: [{ name: "Acme Accelerator", aliases: [], surfaces: [], parentEntityName: "Acme" }],
};

describe("web watch helpers", () => {
  it("searches the name, starred brands and products once each, capped", () => {
    expect(watchNames(graph)).toEqual(["Acme", "Acme Labs", "Acme Accelerator"]);
  });
  it("checks Google's first page next to the words prospects type", () => {
    expect(searchQueries("Acme")).toEqual(['"Acme" reviews', '"Acme" scam', '"Acme" complaints']);
    expect(searchQueries("  ")).toEqual([]);
  });
  it("describes who a finding must be about", () => {
    expect(whoOf(graph)).toEqual({ names: ["Acme", "Jane Doe", "Acme Labs", "Footer Link"], domains: ["acme.com"] });
  });
});
