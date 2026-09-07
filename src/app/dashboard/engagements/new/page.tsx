// src/app/dashboard/engagements/new/page.tsx
//
// One workspace = one client now — a workspace is never client-less
// (POST /api/workspaces creates the client in the same request as the
// workspace itself, see that route's own comment), so there is no more
// "add a second client to this workspace" action to route to. Creating
// a NEW client now means creating a NEW workspace, which is exactly
// what /home/new already does.
//
// A permanent redirect, not a deleted route — anything bookmarked or
// linked to this URL still lands somewhere real.

import { redirect } from "next/navigation";

export default function NewEngagementPage() {
  redirect("/home/new");
}
