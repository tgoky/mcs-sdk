import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";

/** Product entry point. Showtime's established client list is its most
 * useful landing page, while its secondary sidebar supplies the rest. */
export default async function ShowtimePage() {
  const session = await getSession();
  const workspace = await getActiveWorkspace(session.whopUserId!);
  if (!(await isPackageInstalledInWorkspace(workspace.workspaceId, "showtime"))) redirect("/dashboard/library");
  redirect("/dashboard/engagements");
}
