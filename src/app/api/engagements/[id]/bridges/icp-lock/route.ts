import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type ColdOpenIcp, type ColdOpenSizingBound } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement, isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { saveIcpLockIntake, type IcpLockInput } from "@/features/cold-open/server/icp-lock";
import { getColdOpenConfig, upsertColdOpenConfig } from "@/features/cold-open/server/config";
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { getClientFacts, recordDossierDecisions } from "@/lib/client-facts";
import { splitFacts } from "@/lib/fact-suggestions";
import { saveVoiceCapture } from "@/features/cold-open/server/voice-capture";
import { saveDailySendSettings } from "@/features/cold-open/server/daily-send";
import { applyResolvableFacts } from "@/lib/field-writeback";
import { afterResponse } from "@/lib/after-response";

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

  // Loading only reads. Trusted facts reach config on Save (POST below),
  // confirming a fact, or Enable — never on a page load.

  const config = await getColdOpenConfig(id);
  const facts = await getClientFacts(id);
  const enabled = await isSkillEnabledForEngagement(id, "icp-lock");
  const primaryDomain = await getPrimaryDomainForEngagement(id);
  const [stackRow] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, id)).limit(1);

  // Saved config wins; otherwise only a trusted fact pre-fills. Everything
  // else is returned as a suggestion shown beside its field — the dossier
  // no longer shows unscored guesses (or invented defaults like a
  // "Professional" tone) as if they were the answer.
  const { trusted, suggestions } = splitFacts(facts, ["productIdentity", "icps", "voiceProfile", "sizingBounds"]);
  const trustedProduct = trusted.productIdentity as { name?: string; url?: string; price?: string; valueProp?: string } | undefined;
  const trustedIcps = Array.isArray(trusted.icps) ? (trusted.icps as ColdOpenIcp[]) : [];
  const trustedVoice = trusted.voiceProfile as { greeting?: string; signOff?: string; tone?: string } | undefined;
  const trustedSizing = trusted.sizingBounds as Record<string, ColdOpenSizingBound> | undefined;

  if (config?.productIdentity?.name) delete suggestions.productIdentity;
  if (config?.icps?.length) delete suggestions.icps;
  if (config?.voiceProfile) delete suggestions.voiceProfile;
  if (config?.sizingBounds && Object.keys(config.sizingBounds).length) delete suggestions.sizingBounds;

  const productName = config?.productIdentity?.name || trustedProduct?.name || "";
  const productUrl =
    config?.productIdentity?.url ||
    trustedProduct?.url ||
    (primaryDomain ? `https://${primaryDomain.replace(/^https?:\/\//i, "")}` : "");

  return NextResponse.json({
    buyer: engagementRow.buyer,
    primaryDomain,
    enabled,
    config: {
      productName,
      productUrl,
      productPrice: config?.productIdentity?.price || trustedProduct?.price || "",
      productValueProp: config?.productIdentity?.valueProp || trustedProduct?.valueProp || "",
      productAllocation: config?.productAllocation || (productName ? { [productName]: 1.0 } : {}),
      icps: config?.icps?.length ? config.icps : trustedIcps,
      sizingBounds: config?.sizingBounds && Object.keys(config.sizingBounds).length ? config.sizingBounds : trustedSizing ?? {},
      reviewRequiredIcps: config?.reviewRequiredIcps || [],
      voiceProfile: config?.voiceProfile || trustedVoice || null,
      sendPlatform: config?.sendPlatform || null,
      // The real Daily Send shape (daily-send.ts), or null when unset.
      dailySendSettings: config?.dailySendSettings ?? null,
      // No copy mode saved yet: upload only makes sense when every ICP
      // already has body templates to rotate — otherwise every lead would
      // be skipped (copy-engine.ts). Live sending is off by default, so
      // generated copy stays a dry run until the user switches it on.
      defaultCopyMode:
        config?.icps?.length && config.icps.every((icp) => (config.bodyVariantPools?.[icp.slug]?.length ?? 0) > 0)
          ? "upload"
          : "generate",
      clientTimezone: (stackRow?.stack as { timezone?: string } | null)?.timezone ?? null,
    },
    suggestions,
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

    // The dossier also edits the voice and daily-send settings. Both used to
    // be sent and silently dropped here. They're saved through the same
    // services the Voice Capture and Daily Send pages use; fields this
    // dossier doesn't edit (subject lines, body templates, the live-send
    // switch) are carried through from what's saved, not reset.
    const warnings: string[] = [];
    const current = await getColdOpenConfig(id);
    const voice = body.voiceProfile;
    if (voice && typeof voice === "object" && [voice.greeting, voice.signOff, voice.tone].every((v) => typeof v === "string" && v.trim())) {
      const voiceResult = await saveVoiceCapture(id, {
        greeting: voice.greeting,
        signOff: voice.signOff,
        tone: voice.tone,
        sourceDomain: current?.voiceProfile?.sourceDomain,
        subjectVariants: current?.subjectVariants ?? [],
        bodyVariantPools: current?.bodyVariantPools ?? {},
      });
      if ("error" in voiceResult) {
        return NextResponse.json({ error: voiceResult.error }, { status: 400 });
      }
      warnings.push(...voiceResult.warnings);
    }

    // The sending tool picked in the dossier's connect panel. Keeps a saved
    // base URL when the platform is unchanged.
    const SEND_PLATFORMS = ["instantly", "smartlead", "lemlist", "reply_io"] as const;
    if (typeof body.sendPlatform === "string" && SEND_PLATFORMS.includes(body.sendPlatform as (typeof SEND_PLATFORMS)[number])) {
      const platform = body.sendPlatform as (typeof SEND_PLATFORMS)[number];
      if (current?.sendPlatform?.platform !== platform) {
        await upsertColdOpenConfig(id, { sendPlatform: { platform } });
      }
    }

    const daily = body.dailySendSettings;
    if (daily && typeof daily === "object") {
      const dailyResult = await saveDailySendSettings(id, {
        volume: Number(daily.volume),
        localHour: Number(daily.localHour),
        timezone: typeof daily.timezone === "string" && daily.timezone.trim() ? daily.timezone.trim() : undefined,
        copyMode: daily.copyMode === "generate" ? "generate" : "upload",
        liveSendEnabled: current?.dailySendSettings?.liveSendEnabled ?? false,
      });
      if ("error" in dailyResult) {
        return NextResponse.json({ error: dailyResult.error }, { status: 400 });
      }
    }

    await recordDossierDecisions(id, {
      productIdentity: {
        name: input.productName.trim(),
        url: input.productUrl.trim(),
        price: input.productPrice.trim(),
        valueProp: input.productValueProp.trim(),
      },
      icps: input.icps,
      voiceProfile: voice && typeof voice === "object" ? { greeting: voice.greeting, signOff: voice.signOff, tone: voice.tone } : undefined,
      sizingBounds: Object.keys(input.sizingBounds).length ? input.sizingBounds : undefined,
    }).catch((err) => console.error(`[bridges/icp-lock] recording suggestion decisions failed for ${id}:`, err));

    await setSkillEnabledForEngagement(id, "icp-lock", true);

    if (input.productUrl) {
      const seedUrl = input.productUrl;
      afterResponse(() =>
        seedPrimaryDomainFromUrl(id, seedUrl).catch((err) =>
          console.error(`[bridges/icp-lock] domain seed failed for ${id}:`, err)
        )
      );
    }

    // Save is the operator's own action: promote the trusted facts the body
    // didn't carry. Only empty fields are filled, so what was saved stays.
    await applyResolvableFacts(id).catch((err) => console.error(`[bridges/icp-lock] applyResolvableFacts error for ${id}:`, err));

    const runId = await dispatchSkillRun(id, "icp-lock", engagementRow.buyer);

    return NextResponse.json({ ok: true, runId, warnings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/icp-lock]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}