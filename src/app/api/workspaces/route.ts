import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { createWorkspace, ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";
import { createMinimalEngagement } from "@/lib/create-minimal-engagement";

export const runtime = "nodejs";

/**
 * Plain HTML form POST from /home/new — deliberately not a fetch()/JSON
 * client action, so creating a workspace has no client-side state or
 * useEffect involved at all, just a form submit and a redirect either way.
 *
 * One workspace = one client, so creating a workspace now creates that
 * client in the same request — the same `name` field does double duty as
 * both the workspace's name and the client's buyer name, since under this
 * model they're the same real-world thing. This is the fix for a
 * workspace that used to be born empty, requiring a separate "add a
 * client" step afterward (the exact multi-client-per-workspace shape the
 * rest of this restructure exists to remove) — a workspace can no longer
 * exist without its one client from the moment it's created.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.whopUserId) {
    redirect("/api/auth/login");
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");
  const packageIds = formData.getAll("packageIds").map((v) => String(v));

  const result = await createWorkspace(session.whopUserId, name, packageIds);

  if ("error" in result) {
    redirect(`/home/new?error=${encodeURIComponent(result.error)}`);
  }

  await createMinimalEngagement({
    whopUserId: session.whopUserId,
    workspaceId: result.workspace.workspaceId,
    buyerName: result.workspace.name,
  });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, result.workspace.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
