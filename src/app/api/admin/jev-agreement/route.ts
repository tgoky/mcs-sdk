// GET /api/admin/jev-agreement?source=jev&days=90
//
// The calibration report (lib/jev-agreement.ts): how often people agreed
// with each suggested fact, by key and confidence band, and what Jev calls
// cost and how they fared. Spans every client, so it's for admins only
// (a signed-in session on the ADMIN_WHOP_EMAILS list; see cron-auth.ts).

import { NextResponse } from "next/server";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import { agreementReport, readingSummary } from "@/lib/jev-agreement";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: Request) {
  const gate = await requireCronOrAdmin(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const source = url.searchParams.get("source")?.trim() || "jev";
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 90, 1), 365);

  const [agreement, readings] = await Promise.all([agreementReport({ source: source === "all" ? undefined : source, sinceDays: days }), readingSummary({ sinceDays: days })]);
  return NextResponse.json({ source, days, agreement, readings });
}
