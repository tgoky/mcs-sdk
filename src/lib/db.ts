import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/models/schema";

/**
 * Supabase Postgres connection via postgres-js.
 *
 * DATABASE_URL comes from Supabase → Settings → Database → Connection string
 * Use the "Transaction" mode pooler URL (port 6543) for serverless/edge:
 *   postgresql://postgres.xxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
 *
 * Use the direct URL (port 5432) for migrations only (drizzle-kit push/migrate).
 * Set DIRECT_URL in .env for that — never use direct URL in serverless functions.
 *
 * Connection is a module singleton — postgres-js handles the pool internally.
 * No need for PrismaClient-style globalThis caching; postgres-js is designed
 * for this pattern.
 */

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. " +
    "Add it from Supabase → Settings → Database → Connection string (Transaction pooler)."
  );
}

const client = postgres(process.env.DATABASE_URL, {
  // Serverless functions are stateless — disable prepare statements
  // which require persistent connections to maintain state.
  prepare: false,
  // Max connections per serverless function instance.
  // Supabase free tier: 15 connections total across all sources.
  // Vercel serverless: each function invocation is isolated,
  // so this limits connections per concurrent invocation.
  max: 1,
});

export const db = drizzle(client, { schema });
