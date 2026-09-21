// app/api/engagements/[id]/discover/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { discoverClient } from "@/lib/discover-client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.domain && typeof body.domain === "string") {
    await seedPrimaryDomainFromUrl(id, body.domain);
  }

  const result = await discoverClient(id);
  return NextResponse.json(result);
}