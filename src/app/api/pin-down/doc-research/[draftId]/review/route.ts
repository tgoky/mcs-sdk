import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/whop-access";
import { reviewPlatformAdapterDraft } from "@/features/pin-down/server/doc-research";

/**
 * Pin-Down recovery gap 6 — the human-review gate the transfer analysis
 * calls for: "Once an admin approves the draft, it registers as a runtime
 * adapter for that engagement only." This route only records the
 * decision (approved/rejected + reviewer + notes) — it deliberately does
 * NOT auto-generate or wire up adapter code on approval. Turning an
 * approved draft into actual working adapter code (a new case in
 * hosting.ts's or booking.ts's switch statement, scoped to this one
 * engagement) is engineering work a human does per-platform, same as
 * every other adapter in this codebase; this route's job is only to
 * gate that work behind an explicit, attributed human decision instead
 * of letting research automatically become executable code.
 */
export async function POST(req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const session = await getSession();
  if (!session.whopUserId || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { draftId } = await params;

  let body: { decision?: "approved" | "rejected"; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'." }, { status: 400 });
  }

  await reviewPlatformAdapterDraft(draftId, body.decision, session.email, body.notes);

  return NextResponse.json({ success: true });
}
