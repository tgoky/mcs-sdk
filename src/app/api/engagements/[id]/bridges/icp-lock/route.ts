import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement, isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { saveIcpLockIntake, type IcpLockInput } from "@/features/cold-open/server/icp-lock";
import { getColdOpenConfig } from "@/features/cold-open/server/config";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * icp-lock's own hinges — mirrors bridges/rep-onboarding/route.ts's shape
 * exactly (GET to prefill, POST to save + enable + dispatch), adapted for
 * Cold Open's product-identity/ICP/sizing-bounds fields. Like
 * rep-onboarding, there's no credential storage happening here —
 * dispatchSkillRun is called with no completedSteps.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [engagementRow] = await db
    .select({ buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);

  if (!engagementRow) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const config = await getColdOpenConfig(id);
  const enabled = await isSkillEnabledForEngagement(id, "icp-lock");

  return NextResponse.json({
    buyer: engagementRow.buyer,
    enabled,
    config: config
      ? {
          productName: config.productIdentity?.name ?? "",
          productUrl: config.productIdentity?.url ?? "",
          productPrice: config.productIdentity?.price ?? "",
          productValueProp: config.productIdentity?.valueProp ?? "",
          productAllocation: config.productAllocation,
          icps: config.icps,
          sizingBounds: config.sizingBounds,
          reviewRequiredIcps: config.reviewRequiredIcps,
        }
      : null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    if (!(await isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "cold-open"))) {
      return NextResponse.json({ error: "Install Cold Open before configuring it for a client." }, { status: 403 });
    }

    const [engagementRow] = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
      .limit(1);

    if (!engagementRow) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const input: IcpLockInput = {
      productName: typeof body.productName === "string" ? body.productName : "",
      productUrl: typeof body.productUrl === "string" ? body.productUrl : "",
      productPrice: typeof body.productPrice === "string" ? body.productPrice : "",
      productValueProp: typeof body.productValueProp === "string" ? body.productValueProp : "",
      productAllocation: typeof body.productAllocation === "object" && body.productAllocation !== null ? body.productAllocation : {},
      icps: Array.isArray(body.icps) ? body.icps : [],
      sizingBounds: typeof body.sizingBounds === "object" && body.sizingBounds !== null ? body.sizingBounds : {},
      reviewRequiredIcps: Array.isArray(body.reviewRequiredIcps) ? body.reviewRequiredIcps : [],
    };

    const result = await saveIcpLockIntake(id, input);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await setSkillEnabledForEngagement(id, "icp-lock", true);
    const runId = await dispatchSkillRun(id, "icp-lock", engagementRow.buyer);

    return NextResponse.json({ ok: true, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/icp-lock]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
