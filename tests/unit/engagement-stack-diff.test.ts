import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { stackDiff } from "@/lib/engagement-stack";
import type { EngagementStack } from "@/models/schema";

const s = (v: Record<string, unknown>) => v as Partial<EngagementStack>;

describe("stackDiff", () => {
  it("keeps only keys the writer changed or added", () => {
    expect(stackDiff(s({ a: 1, b: { x: 1 } }), s({ a: 1, b: { x: 2 }, c: "new" }))).toEqual({ b: { x: 2 }, c: "new" });
  });

  it("removes keys the writer dropped or set to undefined", () => {
    const patch = stackDiff(s({ a: 1, secret: "s", gone: true }), s({ a: 1, secret: undefined }));
    expect(Object.keys(patch).sort()).toEqual(["gone", "secret"]);
    expect(patch).toMatchObject({ secret: undefined, gone: undefined });
  });

  it("is empty when nothing changed, so nothing else is touched", () => {
    expect(stackDiff(s({ a: 1, b: [1, 2] }), s({ a: 1, b: [1, 2] }))).toEqual({});
  });

  it("treats a missing copy as an empty stack", () => {
    expect(stackDiff(null, s({ a: 1 }))).toEqual({ a: 1 });
  });
});
