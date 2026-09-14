import { describe, it, expect } from "vitest";
import { isUniqueConstraintViolation } from "@/lib/db-errors";

describe("isUniqueConstraintViolation", () => {
  it("detects a raw postgres.js unique-violation error (code on the object itself)", () => {
    const err = Object.assign(new Error('duplicate key value violates unique constraint "foo_unique"'), { code: "23505" });
    expect(isUniqueConstraintViolation(err)).toBe(true);
  });

  it("detects a drizzle-orm DrizzleQueryError wrapping the real error in .cause", () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "foo_unique"'), { code: "23505" });
    const wrapped = new Error("Failed query: insert into ...\nparams: ...");
    (wrapped as Error & { cause?: unknown }).cause = cause;
    expect(isUniqueConstraintViolation(wrapped)).toBe(true);
  });

  it("does not false-positive on an unrelated foreign-key violation", () => {
    const err = Object.assign(new Error('update or delete on table "x" violates foreign key constraint "y"'), { code: "23503" });
    expect(isUniqueConstraintViolation(err)).toBe(false);
  });

  it("does not false-positive on an unrelated error whose message happens to mention the word 'unique'", () => {
    const err = new Error("Please choose a unique username.");
    expect(isUniqueConstraintViolation(err)).toBe(false);
  });

  it("does not throw or infinite-loop on a circular .cause chain", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    const b: Error & { cause?: unknown } = new Error("b");
    a.cause = b;
    b.cause = a;
    expect(() => isUniqueConstraintViolation(a)).not.toThrow();
  });

  it("returns false for non-error values", () => {
    expect(isUniqueConstraintViolation(null)).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
    expect(isUniqueConstraintViolation("just a string")).toBe(false);
    expect(isUniqueConstraintViolation(42)).toBe(false);
  });
});
