import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { update: vi.fn() } }));

import { undash, undashDeep, NO_DASHES_RULE } from "@/lib/plain-punctuation";
import { callClaude, callClaudeWithTools, callOpenRouterModel } from "@/lib/llm";

describe("undash", () => {
  it("leaves text without dashes alone", () => {
    expect(undash("Plain text, no dashes - just a hyphen.")).toBe("Plain text, no dashes - just a hyphen.");
  });

  it("turns ranges into hyphens", () => {
    expect(undash("Send 3–5 emails in 2024—2025 for $10 – $20.")).toBe("Send 3-5 emails in 2024-2025 for $10-$20.");
  });

  it("turns a dash between words into a comma", () => {
    expect(undash("We noticed your team — it's growing fast.")).toBe("We noticed your team, it's growing fast.");
    expect(undash("Fast—and cheap")).toBe("Fast, and cheap");
  });

  it("drops a dash that follows other punctuation, and one at the end of a line", () => {
    expect(undash("Here's the plan: — start small.")).toBe("Here's the plan: start small.");
    expect(undash("Call ended —\nNext steps below")).toBe("Call ended\nNext steps below");
  });

  it("turns a dash that starts a list line into a hyphen bullet", () => {
    expect(undash("Wins:\n— Booked 3 calls\n  – Rebooked 1")).toBe("Wins:\n- Booked 3 calls\n  - Rebooked 1");
  });

  it("cleans every string in a tool call's input, keeping its shape", () => {
    expect(undashDeep({ subject: "Quick one — worth a look?", n: 2, tags: ["a — b"], nested: { ok: true } })).toEqual({
      subject: "Quick one, worth a look?",
      n: 2,
      tags: ["a, b"],
      nested: { ok: true },
    });
  });
});

describe("llm.ts applies the house style", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "k";
    process.env.OPENROUTER_API_KEY = "k";
  });
  afterEach(() => vi.unstubAllGlobals());

  const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

  it("adds the rule to the system prompt and cleans the reply", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: [{ type: "text", text: "Booked — see you then." }], usage: {} }) });
    const res = await callClaude({ model: "FAST", system: "Be brief.", userMessage: "hi" });
    expect(res.text).toBe("Booked, see you then.");
    const system: string = sentBody().system ?? sentBody().messages?.[0]?.content;
    expect(system).toContain("Be brief.");
    expect(system).toContain(NO_DASHES_RULE);
  });

  it("cleans tool-call text and tool inputs", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "Drafting — one moment." },
          { type: "tool_use", id: "t1", name: "draft", input: { body: "Hi — quick question" } },
        ],
        usage: {},
        choices: [
          {
            message: {
              content: "Drafting — one moment.",
              tool_calls: [{ id: "t1", function: { name: "draft", arguments: JSON.stringify({ body: "Hi — quick question" }) } }],
            },
          },
        ],
      }),
    });
    const res = await callClaudeWithTools({ model: "FAST", system: "", messages: [{ role: "user", content: "go" }], tools: [] });
    expect(res.content).toEqual(
      expect.arrayContaining([
        { type: "text", text: "Drafting, one moment." },
        expect.objectContaining({ type: "tool_use", input: { body: "Hi, quick question" } }),
      ])
    );
  });

  it("keeps another engine's answer exactly as given (Reputation Manager records it)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "Acme — mixed reviews." } }], usage: {} }) });
    const res = await callOpenRouterModel("openai/gpt-4o", { system: "Answer plainly.", userMessage: "Acme?" });
    expect(res.text).toBe("Acme — mixed reviews.");
    expect(sentBody().messages[0].content).toBe("Answer plainly.");
  });
});
