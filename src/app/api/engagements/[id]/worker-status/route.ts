import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { getMissingRequiredFields } from "@/lib/worker-config-completeness";
import { workersForProduct } from "@/lib/worker-registry";
import type { ProductId } from "@/lib/product-catalog";

export const runtime = "nodejs";
export const revalidate = 0;

const PRODUCTS: ProductId[] = ["showtime", "reputation-manager", "cold-open", "whop-agent"];

/**
 * Real per-worker status for one product on one client — what the
 * dossiers show instead of a hard-coded "7/7 Active". A worker is:
 *   - "off" when it's been switched off for this client,
 *   - "needs setup" when it's on but a required field is missing (runs
 *     are blocked until it's filled — inngest/skill.ts's own gate),
 *   - "ready" otherwise.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const product = new URL(req.url).searchParams.get("product") as ProductId | null;
    if (!product || !PRODUCTS.includes(product)) {
      return NextResponse.json({ error: `product must be one of: ${PRODUCTS.join(", ")}` }, { status: 400 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    const [row] = await db
      .select({ engagementId: engagements.engagementId })
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
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const workers = await Promise.all(
      workersForProduct(product).map(async (w) => {
        const enabled = await isSkillEnabledForEngagement(id, w.id);
        const missing = enabled ? await getMissingRequiredFields(w.id, id) : [];
        return {
          workerId: w.id,
          name: w.name,
          enabled,
          status: !enabled ? "off" : missing.length > 0 ? "needs_setup" : "ready",
          missing: missing.map((m) => ({ key: m.key, label: m.label, reason: m.reason })),
        };
      })
    );

    return NextResponse.json({ workers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[worker-status GET]", message);
    return NextResponse.json({ error: "Failed to load worker status." }, { status: 500 });
  }
}
