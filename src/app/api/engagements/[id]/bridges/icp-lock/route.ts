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
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { getClientFacts } from "@/lib/client-facts";
import { applyResolvableFacts } from "@/lib/field-writeback";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * icp-lock's bridge route — Single Dossier prefill and save handler for Cold Open.
 * Pulls harvested client_facts (productIdentity, icps, voiceProfile) when
 * coldOpenConfig is incomplete to enable 1-click pipeline arming.
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
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!engagementRow) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  // Attempt auto-writeback of any trusted facts before loading config
  await applyResolvableFacts(id).catch((err) =>
    console.error(`[bridges/icp-lock] applyResolvableFacts error for ${id}:`, err)
  );

  const config = await getColdOpenConfig(id);
  const facts = await getClientFacts(id);
  const enabled = await isSkillEnabledForEngagement(id, "icp-lock");
  const primaryDomain = await getPrimaryDomainForEngagement(id);

  // Extract candidate suggestions from fact store
  const factList = Array.isArray(facts) ? facts : Object.values(facts);
  const factMap = Object.fromEntries(factList.map((f) => [f.key, f.value]));

  const suggestedProduct = factMap.productIdentity as
    | { name?: string; url?: string; price?: string; valueProp?: string }
    | undefined;
  const suggestedIcps = (Array.isArray(factMap.icps) ? factMap.icps : []) as Array<any>;
  const suggestedVoice = factMap.voiceProfile as
    | { greeting?: string; signOff?: string; tone?: string }
    | undefined;

  const productName = config?.productIdentity?.name || suggestedProduct?.name || engagementRow.buyer || "";
  const productUrl =
    config?.productIdentity?.url ||
    suggestedProduct?.url ||
    (primaryDomain ? `https://${primaryDomain.replace(/^https?:\/\//i, "")}` : "");
  const productPrice = config?.productIdentity?.price || suggestedProduct?.price || "";
  const productValueProp = config?.productIdentity?.valueProp || suggestedProduct?.valueProp || "";

  return NextResponse.json({
    buyer: engagementRow.buyer,
    primaryDomain,
    enabled,
    config: {
      productName,
      productUrl,
      productPrice,
      productValueProp,
      productAllocation: config?.productAllocation || (productName ? { [productName]: 1.0 } : {}),
      icps: config?.icps?.length ? config.icps : suggestedIcps,
      sizingBounds: config?.sizingBounds || {},
      reviewRequiredIcps: config?.reviewRequiredIcps || [],
      voiceProfile: config?.voiceProfile || suggestedVoice || { greeting: "Hi {first_name},", signOff: "Best,", tone: "Professional" },
      sendPlatform: config?.sendPlatform || null,
      dailySendSettings: config?.dailySendSettings || { dailyLimit: 50, sendWindowHours: "09:00-17:00" },
    },
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
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
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

    if (input.productUrl) {
      seedPrimaryDomainFromUrl(id, input.productUrl).catch((err) =>
        console.error(`[bridges/icp-lock] domain seed failed for ${id}:`, err)
      );
    }

    const runId = await dispatchSkillRun(id, "icp-lock", engagementRow.buyer);

    return NextResponse.json({ ok: true, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/icp-lock]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}