import { vi } from "vitest";

/**
 * A drizzle-orm query builder chain (`db.select().from().where()...`) is
 * "thenable" — every intermediate call returns an object that can itself be
 * awaited, resolving to whatever the full chain would have returned. This
 * fake reproduces just enough of that shape to test route handlers and
 * server components without a real Postgres connection: every chain method
 * returns the same object, and awaiting it at any point resolves to
 * whatever result you configured.
 *
 * Usage:
 *   const db = fakeDb([{ id: 1 }]);
 *   await db.select().from(x).where(y);      // -> [{ id: 1 }]
 *
 * For code that runs multiple queries in sequence (e.g. Promise.all of
 * several independent selects), use `fakeDbSequence` instead so each call
 * to db.select() can return different rows.
 */
export function fakeDb(rows: unknown[] = []) {
  const chain: any = {
    select: vi.fn(() => chain),
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    values: vi.fn(() => chain),
    update: vi.fn(() => chain),
    set: vi.fn(() => chain),
    returning: vi.fn(() => chain),
    onConflictDoUpdate: vi.fn(() => chain),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return chain;
}

/**
 * Like fakeDb, but each call to `.select()` advances to the next configured
 * result set — for code paths (like the parallelized dashboard queries)
 * that issue several independent `db.select()` calls and expect different
 * rows back from each.
 */
export function fakeDbSequence(resultsInCallOrder: unknown[][]) {
  let call = 0;
  const makeChain = (rows: unknown[]): any => {
    const chain: any = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      then: (resolve: (v: unknown) => void) => resolve(rows),
    };
    return chain;
  };

  return {
    select: vi.fn(() => {
      const rows = resultsInCallOrder[call] ?? [];
      call += 1;
      return makeChain(rows);
    }),
  };
}
