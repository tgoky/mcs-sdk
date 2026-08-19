import { NextResponse } from "next/server";
import { fetchBookingOptions } from "@/lib/platforms/booking";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { resolveVaultCredentialValue, vaultCredentialBelongsToTenant } from "@/lib/credentials";

/**
 * Live calendar/event-type discovery for the NEW-engagement wizard, where
 * the buyer's API key only exists as an unsaved value in the browser (it's
 * encrypted and stored later, at /api/engagements/setup). For an already-
 * onboarded engagement, use /api/engagements/[id]/booking-calendars
 * instead — that route resolves the stored credential server-side so the
 * buyer never re-pastes a secret just to fix a calendar selection.
 *
 * Accepts either `apiKey` (paste mode, unchanged from before) or `vaultId`
 * (reuse-a-saved-credential mode — the wizard never has the plaintext for
 * that path, only the vault row's id). A session + workspace check only
 * runs on the vaultId path, since that's the only path that needs tenant
 * scoping; the apiKey path is exactly as it was before this change.
 */
export async function POST(request: Request) {
  try {
    const { platform, apiKey, vaultId, locationId } = await request.json();

    let resolvedKey: string;
    if (typeof apiKey === "string" && apiKey.trim()) {
      resolvedKey = apiKey.trim();
    } else if (typeof vaultId === "string" && vaultId.trim()) {
      const session = await getSession();
      if (!session?.whopUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const activeWorkspace = await getActiveWorkspace(session.whopUserId);
      const owned = await vaultCredentialBelongsToTenant(vaultId.trim(), activeWorkspace.workspaceId);
      if (!owned) {
        return NextResponse.json({ error: "Saved credential not found or access denied." }, { status: 404 });
      }
      resolvedKey = await resolveVaultCredentialValue(vaultId.trim());
    } else {
      return NextResponse.json({ error: "API Key is required" }, { status: 400 });
    }

    if (platform === "ghl_calendar" && !locationId) {
      // Nothing to list until a Location ID is entered — not an error state.
      return NextResponse.json({ success: true, options: [] });
    }

    const options = await fetchBookingOptions(platform, resolvedKey, locationId);
    return NextResponse.json({ success: true, options });
  } catch (err: any) {
    console.error("[api/integrations/booking/events]", err.message);
    return NextResponse.json({ error: err.message || "Failed to resolve booking events" }, { status: 500 });
  }
}
