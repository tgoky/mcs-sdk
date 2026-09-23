import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { update: vi.fn() } }));

import { undash, undashDeep, NO_DASHES_RULE } from "@/lib/plain-punctuation";
import { callClaude, callClaudeWithTools, callOpenRouterModel } from "@/lib/llm";

describe("undash", () => {
  const cases: [string, string][] = [
    // Real text from saved runs, notifications and chat replies.
    ["Weekly readout — Mudd Ventures", "Weekly readout: Mudd Ventures"],
    ["All 2 call(s) failed to brief — see summary for per-call errors.", "All 2 call(s) failed to brief. See summary for per-call errors."],
    ["Runs that depend on it — bookings, briefs, reschedule links — will fail.", "Runs that depend on it (bookings, briefs, reschedule links) will fail."],
    ["Doing well, thanks. What can I help you with — want to run Call Brief for a client?", "Doing well, thanks. What can I help you with? Want to run Call Brief for a client?"],
    ["No bookings materialized—worth confirming whether that deal is moving.", "No bookings materialized. Worth confirming whether that deal is moving."],
    ['"How long is this going to take?" — text overlay on a timer', '"How long is this going to take?": text overlay on a timer'],
    ["You're Booked — Here's Exactly What Happens Next", "You're Booked: Here's Exactly What Happens Next"],
    // Short tails, asides, continuations.
    ["Recovery window elapsed — lost.", "Recovery window elapsed (lost)."],
    ["The copy is sharp — and short — throughout.", "The copy is sharp, and short, throughout."],
    ["Fast — not cheap.", "Fast, not cheap."],
    ["Hi {{contact.first_name}} — quick question about next week?", "Hi {{contact.first_name}}, quick question about next week?"],
    // Abbreviations don't end a sentence; examples join with a comma or brackets.
    ["Concerns specific to this ICP — e.g. 'Is the price fair?', 'Do I need to be technical?'", "Concerns specific to this ICP, e.g. 'Is the price fair?', 'Do I need to be technical?'"],
    ["Include proof if available — e.g. stacks reviewed, margin caught, or a named case — avoid vague claims otherwise", "Include proof if available (e.g. stacks reviewed, margin caught, or a named case). Avoid vague claims otherwise"],
    ["Lots of options — CRM, email, etc. — all supported.", "Lots of options (CRM, email, etc.) all supported."],
    ["If it becomes relevant next month, whenever — the option's still open.", "If it becomes relevant next month, whenever, the option's still open."],
    ["Hey, it's me — thanks for booking your call.", "Hey, it's me, thanks for booking your call."],
    // Ranges, bullets, punctuation already there, trailing dash.
    ["Send 3–5 emails in 2024—2025 for $10 – $20.", "Send 3-5 emails in 2024-2025 for $10-$20."],
    ["Wins:\n— Booked 3 calls\n  – Rebooked 1", "Wins:\n- Booked 3 calls\n  - Rebooked 1"],
    ["Here's the plan: — start small.", "Here's the plan: start small."],
    ["Call ended —\nNext steps below", "Call ended\nNext steps below"],
  ];
  it.each(cases)("%s", (input, expected) => {
    expect(undash(input)).toBe(expected);
  });

  it("never lowercases, capitalizes or splits code, merge tags or URLs", () => {
    expect(undash("Paste into GHL — {{contact.first_name}} merge tags stay.")).toBe("Paste into GHL. {{contact.first_name}} merge tags stay.");
    expect(undash("Uses stack.sms_platform — see settings.")).toBe("Uses stack.sms_platform: see settings.");
    expect(undash("It broke — sms_platform was unset on that engagement.")).toBe("It broke: sms_platform was unset on that engagement.");
  });

  it("only swaps the dash character inside HTML, so the page stays valid", () => {
    const html = "<!doctype html><title>You're confirmed — Acme</title><style>/* Hero — video */</style><p>Takes 2–3 min</p>";
    expect(undash(html)).toBe("<!doctype html><title>You're confirmed, Acme</title><style>/* Hero, video */</style><p>Takes 2-3 min</p>");
  });

  it("leaves text without dashes alone", () => {
    expect(undash("Plain text, no dashes - just a hyphen.")).toBe("Plain text, no dashes - just a hyphen.");
  });

  it("cleans every string in a value, keeping its shape", () => {
    expect(undashDeep({ subject: "Quick one — worth a look?", n: 2, tags: ["Stop — read this"], nested: { ok: true } })).toEqual({
      subject: "Quick one: worth a look?",
      n: 2,
      tags: ["Stop: read this"],
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
    expect(res.text).toBe("Booked: see you then.");
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
        { type: "text", text: "Drafting: one moment." },
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
