import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

// ‼️ ADD THIS LINE: This forces the terminal to read your Next.js env file
dotenv.config({ path: ".env" });

/**
 * Drizzle Kit config for migrations.
 *
 * Uses DIRECT_URL (port 5432) not DATABASE_URL (pooler port 6543).
 * The pooler doesn't support DDL statements — always use the direct
 * connection for push/migrate, never in production runtime code.
 *
 * Add to .env:
 * DIRECT_URL=postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres
 *
 * Commands:
 * npx drizzle-kit push        — push schema directly (dev)
 * npx drizzle-kit generate    — generate migration SQL files
 * npx drizzle-kit migrate     — apply migration files
 */
export default {
  schema: "./src/models/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
} satisfies Config;