// src/app/api/health/route.ts
//
// For the hosting platform's health check: 200 when this copy of the app
// can reach the database, 503 when it can't. Public (see middleware.ts),
// so it says nothing beyond up or down.
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), DB_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([db.execute(sql`select 1`).then(() => "ok" as const), timedOut]);
    if (result === "timeout") throw new Error("database check timed out");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[health] database check failed:", err);
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timer);
  }
}
