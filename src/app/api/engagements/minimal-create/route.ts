// src/app/api/engagements/minimal-create/route.ts
//
// Phase 6 — the one "create a client" entry point, replacing the two
// separate wizards (/dashboard/engagements/new's multi-step Showtime flow
// and /dashboard/reputation-manager/new's identity-graph flow). Calls the
// exact same createMinimalEngagement Teammates chat's create_client tool
// already uses — not a second, drifting implementation of "insert a bare
// engagement row." Name only, product-agnostic: which workers actually
// get set up afterward (Pin-Down, Identity Setup, both, neither yet) is a
// decision made on the engagement's own Library page, not at creation
// time — same real behavior a chat-created client already has, now the
// same for one created through this page too.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { createMinimalEngagement } from "@/lib/create-minimal-engagement";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const buyerName = typeof body?.buyerName === "string" ? body.buyerName.trim() : "";
    if (!buyerName) {
      return NextResponse.json({ error: "A client name is required." }, { status: 400 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const { engagementId } = await createMinimalEngagement({ whopUserId: session.whopUserId, workspaceId: activeWorkspace.workspaceId, buyerName });

    return NextResponse.json({ engagementId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
