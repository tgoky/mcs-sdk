// src/lib/db.ts
//
// Real Postgres connection via Drizzle. This was previously a fully offline
// in-memory mock ("COMPLETELY OFFLINE CONCURRENCY-SAFE MOCK ENGINE FOR
// FRONTEND UI DESIGN") — every db.select()/insert()/update() call in the app
// was reading/writing a hardcoded array and silently discarding writes.
// That meant skill_runs, phase history, costs, and errors were never
// actually persisted anywhere, regardless of what schema.ts declared.
//
// Uses the pooled connection (DATABASE_URL) for runtime queries. Migrations
// / schema pushes use DIRECT_URL via drizzle.config.ts, not this file.
//
// Required env var: DATABASE_URL=postgresql://...  (Supabase pooler, port 6543)
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/models/schema";

declare global {
  // eslint-disable-next-line no-var
  var __mudd_pg_client: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your environment variables " +
      "(Supabase pooler connection string, port 6543) to connect the app to Postgres."
    );
  }
  // `prepare: false` is required for Supabase's transaction-mode pooler.
  //
  // Connections per copy of the app. Every copy opens up to this many, so
  // (copies running at once) x DATABASE_POOL_MAX must stay under the
  // Supabase pooler's own connection limit for your plan. 10 is
  // postgres-js's own default, kept so nothing changes until it's set.
  const max = Number(process.env.DATABASE_POOL_MAX) || 10;
  return postgres(url, {
    prepare: false,
    max,
    // Hand idle connections back so short-lived copies (serverless) don't
    // hold pooler slots they aren't using.
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// Reuse the connection across hot reloads in dev / across invocations on
// serverless platforms that keep the module warm, instead of opening a new
// pool on every import.
const client = globalThis.__mudd_pg_client ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__mudd_pg_client = client;
}

export const db = drizzle(client, { schema });