import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { runDiscoveryPrefill } from "@/features/pin-down/server/discovery-prefill";

// Crawling a buyer's marketing site plus a small handful of common paths,
// plus one fast Claude call to infer buyer/offer/ICP — should finish well
// under this, but domains that hang on a slow redirect chain shouldn't be
// able to tie up the operator's onboarding form indefinitely.
export const maxDuration = 30;

/**
 * Pin-Down recovery gap 1 — smart pre-fill.
 *
 * Called from the onboarding form's "smart pre-fill" toggle BEFORE an
 * engagement exists yet (Discovery, in the OG SKILL.md, ran before Plan
 * and Build) — takes just a domain, returns suggestions for the operator
 * to review/accept/override as they fill in the rest of the form. Never
 * writes to the database itself; the setup route persists whatever the
 * operator actually submits, prefilled values included, so there's a
 * single source of truth for "what actually got configured" rather than
 * two write paths that could drift.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.whopUserId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.domain || typeof body.domain !== "string" || body.domain.trim().length === 0) {
    return NextResponse.json({ error: "domain is required." }, { status: 400 });
  }

  try {
    const result = await runDiscoveryPrefill(body.domain);
    return NextResponse.json({ success: true, prefill: result });
  } catch (e: any) {
    console.error("[discovery-prefill] Failed:", e.message);
    return NextResponse.json(
      { error: `Discovery pre-fill failed: ${e.message}` },
      { status: 500 }
    );
  }
}
