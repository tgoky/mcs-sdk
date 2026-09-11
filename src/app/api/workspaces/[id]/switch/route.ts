import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getOwnedWorkspace, getPrimaryEngagementIdForWorkspace, ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * Backs both "Enter workspace" on /home and the workspace switcher in the
 * primary rail's account popover — same plain-form-POST-then-redirect
 * shape as /api/auth/logout, so switching workspaces has no client-side
 * fetch, state, or useEffect involved.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    redirect("/api/auth/login");
  }

  const { id } = await params;

  // Confirms this account actually owns the workspace before trusting it —
  // never just cookies().set(id) off the raw param.
  const workspace = await getOwnedWorkspace(session.whopUserId, id);
  if (!workspace) {
    redirect("/home");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Lands directly on this workspace's one client — since a workspace IS
  // a client under this app's model, "switch workspace" is really "switch
  // client," and the useful destination is that client's own profile, not
  // Work/home (which said nothing about which client you'd just landed
  // on). Falls back to /dashboard only for a workspace whose client
  // somehow doesn't resolve (predates the one-workspace-one-client
  // guarantee, or its client was deleted) — same fallback
  // /dashboard/engagements/page.tsx already uses for the same case.
  const engagementId = await getPrimaryEngagementIdForWorkspace(workspace.workspaceId);
  redirect(engagementId ? `/dashboard/engagements/${engagementId}` : "/dashboard");
}
