// src/app/api/engagements/[id]/products/[productId]/skip-onboarding/route.ts
//
// The "Skip for now" side of the product onboarding gate (see
// src/lib/product-onboarding.ts's header for the full picture). This
// deliberately does NOT touch whether the product is onboarded — it only
// records that the operator has already seen and dismissed the "finish
// setup" prompt for this product, on this engagement, so enable/route.ts
// and its siblings can keep refusing a bare enable (unchanged) while the
// CLIENT stops hard-redirecting to the onboarding bridge on every
// subsequent attempt and shows a quiet inline note instead.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isProductId } from "@/lib/product-catalog";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; productId: string }> }) {
  try {
    const { id, productId } = await params;
    if (!isProductId(productId)) {
      return NextResponse.json({ error: `Unknown product: ${productId}` }, { status: 400 });
    }

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
    }

    const stack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
    const nextStack: EngagementStack = {
      ...stack,
      product_onboarding_skip_dismissed_at: {
        ...stack.product_onboarding_skip_dismissed_at,
        [productId]: new Date().toISOString(),
      },
    };

    await db.update(engagements).set({ stack: nextStack, updatedAt: new Date() }).where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id]/products/[productId]/skip-onboarding POST]", err);
    return NextResponse.json({ error: "Failed to skip onboarding." }, { status: 500 });
  }
}
