import { describe, it, expect, vi, beforeEach } from "vitest";

const askJev = vi.fn();
vi.mock("@/lib/jev", () => ({ askJev: (...a: unknown[]) => askJev(...a) }));
const callClaude = vi.fn();
vi.mock("@/lib/llm", () => ({ callClaude: (...a: unknown[]) => callClaude(...a) }));

import { classifyReply, DEFAULT_TAXONOMY } from "@/features/cold-open/server/reply-classifier";

describe("sorting cold email replies with Jev", () => {
  beforeEach(() => {
    askJev.mockReset();
    callClaude.mockReset();
  });

  it("uses Jev's pick from the taxonomy, logged as a reading for this client", async () => {
    askJev.mockResolvedValue({ answers: { disposition: { type: "choice", choice: "interested", confidence: 0.86, probabilities: {} } } });
    const r = await classifyReply({ bodyText: "Sounds good, can we talk Thursday?" }, { name: "Acme" }, DEFAULT_TAXONOMY, { engagementId: "e1" });
    expect(r).toEqual({ disposition: "interested", confidence: "high", summary: "Sorted by Jev (86% sure).", method: "jev" });
    const call = askJev.mock.calls[0][0] as { questions: { disposition: { criteria: Record<string, string> } }; reading: { engagementId: string; purpose: string } };
    expect(Object.keys(call.questions.disposition.criteria)).toEqual(Object.keys(DEFAULT_TAXONOMY));
    expect(call.reading).toEqual({ engagementId: "e1", purpose: "cold-open-reply" });
    expect(callClaude).not.toHaveBeenCalled();
  });

  it("sends an unsure pick to a person", async () => {
    askJev.mockResolvedValue({ answers: { disposition: { type: "choice", choice: "not_now", confidence: 0.41, probabilities: {} } } });
    expect(await classifyReply({ bodyText: "maybe" })).toMatchObject({ disposition: "unclassified", method: "jev" });
  });

  it("falls back to the model when Jev can't be reached", async () => {
    askJev.mockRejectedValue(new Error("down"));
    callClaude.mockResolvedValue({ text: '{"disposition":"objection","confidence":"medium","summary":"Already uses a competitor."}' });
    expect(await classifyReply({ bodyText: "We already use X." })).toMatchObject({ disposition: "objection", method: "llm" });
  });

  it("still catches opt-outs and auto-replies without asking anyone", async () => {
    expect(await classifyReply({ bodyText: "Please remove me from your list" })).toMatchObject({ disposition: "unsubscribe", method: "heuristic" });
    expect(askJev).not.toHaveBeenCalled();
  });
});
