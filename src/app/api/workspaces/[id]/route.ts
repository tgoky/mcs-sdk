import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { renameWorkspace, deleteWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * PATCH /api/workspaces/[id]
 * Backs "Edit workspace name" in the /home workspace card's menu
 * (workspace-card-menu.tsx). Body: { name: string }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.name !== "string") {
      return NextResponse.json({ error: "name must be a string." }, { status: 400 });
    }

    const result = await renameWorkspace(session.whopUserId, id, body.name);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ workspace: result });
  } catch (err) {
    console.error("[workspaces/[id] PATCH] failed:", err);
    return NextResponse.json({ error: "Failed to rename workspace." }, { status: 500 });
  }
}

/**
 * DELETE /api/workspaces/[id]
 * Backs "Delete workspace" in the /home workspace card's menu. Soft delete
 * only — see deleteWorkspace's own comment for why, and for the two
 * guardrails (can't delete the default workspace, can't delete your last
 * remaining one) enforced there rather than here. Body:
 * { confirmWorkspaceName: string } — must match the workspace's current
 * name exactly, same "type to confirm" pattern as deleting a client.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const confirmWorkspaceName = typeof body?.confirmWorkspaceName === "string" ? body.confirmWorkspaceName : "";

    const result = await deleteWorkspace(session.whopUserId, id, confirmWorkspaceName);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[workspaces/[id] DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to delete workspace." }, { status: 500 });
  }
}
