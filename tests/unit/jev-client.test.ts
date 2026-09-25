import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const recordJevReading = vi.fn(async () => undefined);
vi.mock("@/lib/jev-readings", () => ({ recordJevReading: (...a: unknown[]) => (recordJevReading as (...x: unknown[]) => Promise<void>)(...a) }));

import { askJev, JEV_PINNED_VERSION } from "@/lib/jev";

const ok = (model: string) =>
  new Response(JSON.stringify({ model, answers: { q: { type: "noul", noul: 0.8 } }, usage: { input_tokens: 1000, output_tokens: 1 } }), { status: 200 });

describe("the Jev client", () => {
  let bodies: { model: string }[];
  beforeEach(() => {
    vi.clearAllMocks();
    bodies = [];
    vi.stubEnv("JEV_TRANSPORT", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("JEV_MODEL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  const mockFetch = (...responses: Response[]) => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return responses.shift()!;
    }) as unknown as typeof fetch;
  };

  it("asks for the pinned version, and logs the reading with what answered", async () => {
    mockFetch(ok(`jev-${JEV_PINNED_VERSION}`));
    const r = await askJev({ state: "x", questions: { q: { type: "noul", instructions: "?" } }, reading: { engagementId: "e1", purpose: "test" } });
    expect(bodies[0].model).toBe(`typesafe/jev-${JEV_PINNED_VERSION}`);
    expect(r.answers.q).toEqual({ type: "noul", noul: 0.8 });
    expect(recordJevReading).toHaveBeenCalledWith(
      expect.objectContaining({ engagementId: "e1", purpose: "test", modelRequested: `typesafe/jev-${JEV_PINNED_VERSION}`, modelServed: `jev-${JEV_PINNED_VERSION}`, questionCount: 1, inputTokens: 1000, error: null })
    );
  });

  it("answers from latest when the pinned id isn't served, rather than not at all", async () => {
    mockFetch(new Response('{"error":"model not found"}', { status: 404 }), ok("jev-1.14.0"));
    const r = await askJev({ state: "x", questions: { q: { type: "noul", instructions: "?" } } });
    expect(bodies.map((b) => b.model)).toEqual([`typesafe/jev-${JEV_PINNED_VERSION}`, "typesafe/jev-latest"]);
    expect(r.model).toBe("jev-1.14.0");
    expect(recordJevReading).not.toHaveBeenCalled();
  });

  it("doesn't retry other errors, and logs the failed reading", async () => {
    mockFetch(new Response("rate limited", { status: 429 }));
    await expect(askJev({ state: "x", questions: {}, reading: { purpose: "test" } })).rejects.toThrow("Jev API error [429]");
    expect(bodies).toHaveLength(1);
    expect(recordJevReading).toHaveBeenCalledWith(expect.objectContaining({ purpose: "test", modelServed: null, error: expect.stringContaining("429") }));
  });

  it("uses JEV_MODEL when set", async () => {
    vi.stubEnv("JEV_MODEL", "typesafe/jev-1.12.0");
    mockFetch(ok("jev-1.12.0"));
    await askJev({ state: "x", questions: {} });
    expect(bodies[0].model).toBe("typesafe/jev-1.12.0");
  });
});
