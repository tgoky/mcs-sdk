// tests/helpers/readable-stack-writes.ts
//
// engagements.stack writes are SQL expressions now (src/lib/engagement-stack.ts),
// which a mocked db can't read. Unit tests that inspect `.set({ stack })`
// mock that module with this instead:
//
//   vi.mock("@/lib/engagement-stack", () => import("../helpers/readable-stack-writes"));
//
// stackChanges(before, after) gives back the row the database would end up
// with; stackPatchSql(patch) gives back the patch itself. That only-changed
// keys are written is covered against real Postgres in
// tests/integration/stack-stale-write.test.ts.
import { vi } from "vitest";
import type * as EngagementStackModule from "@/lib/engagement-stack";

const actual = await vi.importActual<typeof EngagementStackModule>("@/lib/engagement-stack");

export const stackDiff = actual.stackDiff;
export const patchEngagementStack = actual.patchEngagementStack;
export const setEngagementStackEntry = actual.setEngagementStackEntry;

export function stackPatchSql(patch: Record<string, unknown>) {
  return patch;
}

export function stackChanges(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...(before ?? {}) };
  for (const [key, value] of Object.entries(actual.stackDiff(before as never, after as never))) {
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result;
}
