import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { storeCredential } from "@/lib/credentials";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session.whopUserId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { engagementId, provider, value } = await request.json();

    if (!engagementId || !provider || !value) {
      return NextResponse.json(
        { error: "Missing required fields: engagementId, provider, value" },
        { status: 400 }
      );
    }

    // Verify the engagement belongs to this user before storing
    const engagement = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.whopUserId, session.whopUserId)
        )
      )
      .limit(1);

    if (engagement.length === 0) {
      return NextResponse.json(
        { error: "Engagement not found or access denied" },
        { status: 404 }
      );
    }

    await storeCredential(
      engagementId,
      provider,
      `secrets://${engagementId}/${provider}_key`,
      value
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[credentials API]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}