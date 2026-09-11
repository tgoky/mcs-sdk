import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getOwnedWorkspace, ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";

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

  // Lands on Work/home with the new client now active, not straight into
  // their profile — switching clients is a starting point, not itself a
  // request to view one client's engagement detail.
  redirect("/dashboard");
}
