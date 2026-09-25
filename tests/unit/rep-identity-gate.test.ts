import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/field-writeback", () => ({ applyResolvableFacts: vi.fn(async () => {}) }));
vi.mock("@/lib/credentials", () => ({ hasCredential: vi.fn() }));
vi.mock("@/features/cold-open/server/config", () => ({ getColdOpenConfig: vi.fn() }));

import { db } from "@/lib/db";
import { applyResolvableFacts } from "@/lib/field-writeback";
import { getMissingRequiredFields } from "@/lib/worker-config-completeness";
import { fakeDb } from "../helpers/fake-db";

// The rep-onboarding bridge route inserts a placeholder identity graph
// (operatorName "", soleAuthorityName "") the moment its form is opened.
// That placeholder must not count as "set up" for any rep worker —
// otherwise rep-twitter-watch fires with an empty `query` and 400s.
describe("Reputation Manager identity gate", () => {
  beforeEach(() => {
    for (const k of Object.keys(db)) delete (db as unknown as Record<string, unknown>)[k];
  });

  it("blocks every rep worker when the identity graph is only a blank placeholder", async () => {
    Object.assign(db, fakeDb([{ operatorName: "", soleAuthorityName: "  " }]));
    for (const worker of ["rep-onboarding", "rep-twitter-watch", "rep-reddit-watch", "rep-engine-panel"] as const) {
      const missing = await getMissingRequiredFields(worker, "eng-1");
      expect(missing.map((m) => m.key)).toEqual(["operatorName", "soleAuthorityName"]);
    }
  });

  it("passes once Identity Setup has actually been filled in", async () => {
    Object.assign(db, fakeDb([{ operatorName: "Acme", soleAuthorityName: "Jane Doe" }]));
    expect(await getMissingRequiredFields("rep-twitter-watch", "eng-1")).toEqual([]);
  });

  it("still reports a missing identity graph when no row exists", async () => {
    Object.assign(db, fakeDb([]));
    const missing = await getMissingRequiredFields("rep-twitter-watch", "eng-1");
    expect(missing.map((m) => m.key)).toEqual(["repIdentityGraph"]);
  });

  it("only reads: a check never promotes facts into config", async () => {
    // It runs from the run gate, page renders and status reads; a Jev
    // reading must not fill a required field without anyone seeing it.
    Object.assign(db, fakeDb([{ operatorName: "", soleAuthorityName: "" }]));
    await getMissingRequiredFields("rep-onboarding", "eng-1");
    expect(applyResolvableFacts).not.toHaveBeenCalled();
  });
});
