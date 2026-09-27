import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getPrimaryDomainForEngagement, setPrimaryDomainForEngagement } from "@/lib/client-profile";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { isValidTimezone } from "@/lib/timezones";

export const runtime = "nodejs";
export const revalidate = 0;

async function owned(engagementId: string): Promise<"signed-out" | { buyer: string; stack: unknown; queuePinWindowHours: number } | null> {
  const session = await getSession();
  if (!session?.whopUserId) return "signed-out";
  const workspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ buyer: engagements.buyer, stack: engagements.stack, queuePinWindowHours: engagements.queuePinWindowHours })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, workspace.workspaceId)))
    .limit(1);
  return row ?? null;
}

/** The client's own details, shared by every product: name, website, time
 * zone, and how long new Queue items stay pinned at the top. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await owned(id);
  if (row === "signed-out") return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!row) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json({ name: row.buyer, website: (await getPrimaryDomainForEngagement(id)) ?? "", timezone: (row.stack as EngagementStack | null)?.timezone ?? "", queuePinWindowHours: row.queuePinWindowHours ?? 48 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await owned(id);
  if (row === "signed-out") return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!row) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; website?: unknown; timezone?: unknown; queuePinWindowHours?: unknown };

  const name = typeof body.name === "string" ? body.name.trim() : null;
  if (name !== null && (!name || name.length > 120)) return NextResponse.json({ error: "Give the client a name (under 120 characters).", field: "name" }, { status: 400 });

  let host: string | null = null;
  if (typeof body.website === "string" && body.website.trim()) {
    try {
      const raw = body.website.trim();
      host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      host = null;
    }
    if (!host || !host.includes(".")) return NextResponse.json({ error: "That doesn't look like a website address.", field: "website" }, { status: 400 });
  }

  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : null;
  if (timezone && !isValidTimezone(timezone)) return NextResponse.json({ error: `"${timezone}" isn't a time zone we recognize.`, field: "timezone" }, { status: 400 });

  const pin = body.queuePinWindowHours;
  if (pin !== undefined && (typeof pin !== "number" || !Number.isInteger(pin) || pin < 1 || pin > 720))
    return NextResponse.json({ error: "Keep items pinned for 1 to 720 hours.", field: "queuePinWindowHours" }, { status: 400 });

  const rowPatch = {
    ...(name && name !== row.buyer ? { buyer: name } : {}),
    ...(typeof pin === "number" && pin !== row.queuePinWindowHours ? { queuePinWindowHours: pin } : {}),
  };
  if (Object.keys(rowPatch).length) await db.update(engagements).set({ ...rowPatch, updatedAt: new Date() }).where(eq(engagements.engagementId, id));
  if (host) await setPrimaryDomainForEngagement(id, host);
  if (timezone !== null) await patchEngagementStack(id, { timezone: timezone || undefined });
  return NextResponse.json({ ok: true });
}
