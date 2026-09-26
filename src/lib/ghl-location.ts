// src/lib/ghl-location.ts
//
// GoHighLevel's Location ID, asked for once per client and reused by every
// skill. A GoHighLevel Private Integration Token opens exactly one
// sub-account and every API call names that sub-account by Location ID, so
// the token alone isn't enough to read calendars, contacts or workflows.
// There's no call that lists locations for such a token (see the comment in
// api/integrations/ghl/locations/route.ts), so the ID comes from the person,
// or from another client already using the same saved token, and is checked
// against the token before it's kept.
//
// It's kept in the three places the runtime already reads it from
// (booking_platform_meta.location_id, email_platform_meta.location_id,
// sms_platform_meta.ghl_location_id), so the booking poller, Pile-On,
// Win-Back, Pre-Call Read, Leak Map and the account pull all see it
// whichever side of GoHighLevel was connected first.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq, inArray } from "drizzle-orm";
import { fetchWithTimeout } from "@/lib/http";

export { GHL_PROVIDERS, isGhlProvider, otherGhlProvider } from "@/lib/ghl-providers";

type StackWithEmailMeta = Partial<EngagementStack> & { email_platform_meta?: { location_id?: string } };

/** The Location ID this client already has, wherever it was saved. */
export function ghlLocationIdOf(stack: Partial<EngagementStack> | null | undefined): string | null {
  const s = (stack ?? {}) as StackWithEmailMeta;
  return s.booking_platform_meta?.location_id || s.email_platform_meta?.location_id || s.sms_platform_meta?.ghl_location_id || null;
}

// GoHighLevel ids are 20-ish letters and digits.
const ID_SHAPE = /^[A-Za-z0-9]{10,40}$/;

/**
 * Accepts the bare ID or anything it's usually copied with: the address bar
 * (app.gohighlevel.com/v2/location/<id>/dashboard, or a white-label domain
 * with the same path) or "Location ID: <id>". Null when nothing looks like one.
 */
export function parseGhlLocationId(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const fromPath = raw.match(/\/location\/([A-Za-z0-9]+)/i)?.[1];
  if (fromPath && ID_SHAPE.test(fromPath)) return fromPath;
  const bare = raw.replace(/^location\s*id\s*[:=]?\s*/i, "").trim();
  return ID_SHAPE.test(bare) ? bare : null;
}

export type GhlLocationCheck =
  | { ok: true; id: string; name: string }
  | { ok: false; status: number; message: string };

/** Asks GoHighLevel whether this token opens this location, and its name. */
export async function checkGhlLocation(token: string, locationId: string): Promise<GhlLocationCheck> {
  try {
    const res = await fetchWithTimeout(`https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId)}`, {
      headers: { Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json" },
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      return { ok: false, status: res.status, message: body };
    }
    const payload = await res.json();
    // The v2 "Get Location" response nests the record under `location`.
    const location = payload.location ?? payload;
    return { ok: true, id: location.id ?? locationId, name: location.business?.name || location.name || "Unnamed location" };
  } catch (err) {
    return { ok: false, status: 0, message: err instanceof Error ? err.message : "GoHighLevel didn't answer." };
  }
}

/** The stack patch that saves a Location ID everywhere it's read from. */
export function ghlLocationPatch(stack: Partial<EngagementStack>, locationId: string): Partial<EngagementStack> {
  const s = stack as StackWithEmailMeta;
  return {
    booking_platform_meta: { ...(s.booking_platform_meta ?? {}), location_id: locationId },
    email_platform_meta: { ...(s.email_platform_meta ?? {}), location_id: locationId },
    sms_platform_meta: { ...(s.sms_platform_meta ?? {}), ghl_location_id: locationId },
  } as Partial<EngagementStack>;
}

/**
 * A Location ID another client already verified with the same saved token.
 * A Private Integration Token opens one sub-account, so every client sharing
 * it shares its location.
 */
export async function ghlLocationFromSharedToken(engagementIds: string[]): Promise<string | null> {
  if (engagementIds.length === 0) return null;
  const rows = await db.select({ stack: engagements.stack }).from(engagements).where(inArray(engagements.engagementId, engagementIds));
  for (const row of rows) {
    const id = ghlLocationIdOf(row.stack as Partial<EngagementStack> | null);
    if (id) return id;
  }
  return null;
}

export async function loadStack(engagementId: string): Promise<Partial<EngagementStack>> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  return ((row?.stack as Partial<EngagementStack> | null) ?? {}) as Partial<EngagementStack>;
}
