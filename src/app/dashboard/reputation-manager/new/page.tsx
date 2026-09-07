// src/app/dashboard/reputation-manager/new/page.tsx
//
// Phase 6 — this used to be Reputation Manager's own separate "new
// client" wizard (the full IdentityGraphForm, submitting straight to
// POST /api/reputation-manager/new). Verified zero field gap against
// bridges/rep-onboarding (same IdentityGraphForm component, same
// saveRepIdentityGraphIntake save function) before replacing this with a
// redirect — nothing here was doing anything bridges/rep-onboarding
// doesn't already do for a client created through the one unified
// entry point instead.
//
// Since-audit update: with one workspace = one client, "create a new
// client" means "create a new workspace" (/home/new), not a step inside
// an existing one — pointed straight there instead of relaying through
// the now also-redirecting /dashboard/engagements/new, to avoid a
// double redirect.
//
// A permanent redirect, not a deleted route — anything with this URL
// bookmarked or linked still lands somewhere real.

import { redirect } from "next/navigation";

export default function ReputationManagerNewPage() {
  redirect("/home/new");
}
