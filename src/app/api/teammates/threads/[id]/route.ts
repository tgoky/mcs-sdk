import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getOwnedThread, loadThreadForDisplay, renameThread, deleteThread } from "@/lib/chat-threads";

export const runtime = "nodejs";

// Reload support for Teammates chat — the client persists a threadId
// locally (localStorage, same per-browser convention as
// usePinnedSkills/right-utility-panel width) and calls this on mount to
// restore the conversation instead of starting blank after a refresh.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const thread = await getOwnedThread(id, activeWorkspace.workspaceId);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    const messages = await loadThreadForDisplay(thread.id);
    return NextResponse.json({ threadId: thread.id, title: thread.title, messages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[teammates/threads/:id]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Rename — a user-driven title edit, distinct from the auto-derived
// first-message title (see chat-threads.ts's deriveThreadTitle).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title : "";
    if (!title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const renamed = await renameThread(id, activeWorkspace.workspaceId, title);
    if (!renamed) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[teammates/threads/:id PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const deleted = await deleteThread(id, activeWorkspace.workspaceId);
    if (!deleted) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[teammates/threads/:id DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
