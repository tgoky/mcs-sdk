import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAvatarStyleId } from "@/lib/avatar";
import { getUserAvatar, setDicebearAvatar, setUploadedAvatar, clearUserAvatar } from "@/lib/user-avatar";

export const runtime = "nodejs";

// Re-enforced here, not just in the picker's client-side resize step —
// a tampered request shouldn't be able to stuff an oversized blob into
// the users row. ~350KB decoded, comfortably above what a resized-to-256px
// JPEG needs.
const MAX_DATA_URI_LENGTH = 500_000;

/**
 * For client components that need the current user's avatar but aren't
 * reachable from a server component's own props — e.g. TeammatesChat,
 * instantiated from three different trees (teammates-workspace.tsx,
 * teammates-panel-content.tsx, enable-worker-modal.tsx). One fetch here
 * beats threading the same avatar prop through three separate parents.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const avatar = await getUserAvatar(session.whopUserId);
    return NextResponse.json({ avatar, identityFallback: session.email || session.whopUserId });
  } catch (err) {
    console.error("[user/avatar GET]", err);
    return NextResponse.json({ error: "Failed to load avatar." }, { status: 500 });
  }
}

/** Body: either { type: "dicebear", style, seed } or { type: "upload", dataUri }. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    if (body.type === "dicebear") {
      if (!isAvatarStyleId(body.style) || typeof body.seed !== "string" || !body.seed) {
        return NextResponse.json({ error: "Invalid avatar selection." }, { status: 400 });
      }
      await setDicebearAvatar(session.whopUserId, body.style, body.seed);
      return NextResponse.json({ ok: true });
    }

    if (body.type === "upload") {
      if (typeof body.dataUri !== "string" || !body.dataUri.startsWith("data:image/")) {
        return NextResponse.json({ error: "Invalid image." }, { status: 400 });
      }
      if (body.dataUri.length > MAX_DATA_URI_LENGTH) {
        return NextResponse.json({ error: "Image is too large — try a smaller photo." }, { status: 400 });
      }
      await setUploadedAvatar(session.whopUserId, body.dataUri);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  } catch (err) {
    console.error("[user/avatar POST]", err);
    return NextResponse.json({ error: "Failed to save avatar." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await clearUserAvatar(session.whopUserId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[user/avatar DELETE]", err);
    return NextResponse.json({ error: "Failed to remove avatar." }, { status: 500 });
  }
}
