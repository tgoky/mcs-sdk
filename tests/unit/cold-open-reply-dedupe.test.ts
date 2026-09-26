import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
import { sameReplyText } from "@/features/cold-open/server/reply-sort";

describe("one reply, however it arrives", () => {
  it("treats the same words from the same lead as the same reply", () => {
    expect(sameReplyText("Sounds  good,\nsend times", "sounds good, send times")).toBe(true);
    expect(sameReplyText("Sounds good", "Not interested")).toBe(false);
    expect(sameReplyText("", "")).toBe(false);
  });
});
