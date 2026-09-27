import { NextResponse } from "next/server";
import { authorizeProductSetup } from "../setup/showtime/access";
import { searchGoogleListings } from "@/features/reputation-manager/server/outscraper-google";
import { resolveOutscraperConfig } from "@/features/reputation-manager/trustpilot-config";
import { rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const revalidate = 0;

/** Google listings matching ?q=, for Google Reviews Watch's Configure to pick the client's own. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeProductSetup(id, "reputation-manager");
  if (!access.ok) return access.response;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ listings: [] });
  if (q.length > 120) return NextResponse.json({ error: "Search with fewer words." }, { status: 400 });
  if (!resolveOutscraperConfig()) return NextResponse.json({ error: "Google search isn't set up on this server." }, { status: 503 });
  const limited = await rateLimitResponse(RATE_LIMITS.setupActivate, access.whopUserId, "Too many searches in a short time. Wait a minute and try again.");
  if (limited) return limited;
  try {
    return NextResponse.json({ listings: await searchGoogleListings(q) });
  } catch (err) {
    console.error(`[google-listings] search failed for ${id}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Google didn't answer. Try again in a moment." }, { status: 502 });
  }
}
