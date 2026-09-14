// src/lib/db-errors.ts
//
// drizzle-orm 0.45.2's postgres-js driver wraps every error the underlying
// `postgres` package throws in a DrizzleQueryError (see node_modules/
// drizzle-orm/pg-core/session.cjs's queryWithCache): its own `.message` is
// always "Failed query: <sql>\nparams: <params>", and the real error —
// the one with Postgres's actual SQLSTATE `.code` (23505 for a unique-
// violation) and a message that actually says "duplicate key value
// violates..." — lives one level down on `.cause`, not on the object
// `catch` binds.
//
// Three call sites in this codebase (booking-event's webhook dedup,
// whop-agent's webhook dedup, and ensureAgentWebhookSubscription's race
// recovery) each hand-rolled this exact check against the top-level
// caught error and never once matched: `"code" in err` is false on a
// DrizzleQueryError, and its message never contains "duplicate key" or
// "unique". Caught by a real-database integration test running two
// genuinely concurrent inserts against the same unique index — the
// intended recovery path silently never ran; the "loser" always threw
// instead of gracefully deferring to the winner.
export function isUniqueConstraintViolation(err: unknown): boolean {
  let current: unknown = err;
  // Walk the cause chain rather than assuming exactly one level of
  // wrapping — cheap insurance against a future driver/ORM version
  // adding or removing a wrapping layer.
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object") {
      const code = (current as { code?: unknown }).code;
      if (code === "23505") return true;
      const message = current instanceof Error ? current.message : undefined;
      if (message && /duplicate key value violates unique constraint/i.test(message)) return true;
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return false;
}
