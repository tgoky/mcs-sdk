import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { updateWorkspaceRegionSettings } from "@/lib/workspace";

export const runtime = "nodejs";

/**
 * PATCH /api/workspaces/[id]/region-settings
 * Backs Settings > Timezones & Region (dashboard/settings/language).
 * Body: { timezone: string; locale: string }
 *
 * This sets the workspace-level *default* only — it does not touch any
 * existing engagement's own stack.timezone (each client's schedule stays
 * exactly as configured). New engagements created after this change pick
 * up the new default; see engagements/new/submit-payload.ts.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { timezone, locale } = body as { timezone?: unknown; locale?: unknown };
    if (typeof timezone !== "string" || typeof locale !== "string") {
      return NextResponse.json({ error: "timezone and locale must be strings." }, { status: 400 });
    }

    const result = await updateWorkspaceRegionSettings(session.whopUserId, id, { timezone, locale });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ workspace: result });
  } catch (err) {
    console.error("[region-settings PATCH] failed:", err);
    return NextResponse.json({ error: "Failed to update region settings." }, { status: 500 });
  }
}
