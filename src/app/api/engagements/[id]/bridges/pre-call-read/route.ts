import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { storeCredential } from "@/lib/credentials";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Pre-Call Read's hinges — brief_trigger_type (nightly vs dynamic), video
 * engagement tracking, and Apollo/PDL prospect-research BYOK. All four
 * verified via their real snake_case stack key: brief_trigger_type is
 * read by src/inngest/crons.ts (a shared cron file, but the only bridge
 * it affects is Pre-Call Read's nightly batch — same pattern as
 * Leak-Map's schedule), and the video-engagement and prospect-research
 * fields resolve to src/features/pre-call-read/server alone.
 *
 * Like Win-Back, not a gate: every field defaults to a sane value
 * ("nightly", "none", []) and Pre-Call Read already waits on its own
 * cron. Optional review/edit screen, reachable anytime.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const [row] = await db
    .select({ buyer: engagements.buyer, stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({
    buyer: row.buyer,
    briefTriggerType: row.stack?.brief_trigger_type ?? "nightly",
    videoEngagementPlatform: row.stack?.video_engagement_platform ?? "none",
    heroVideoId: row.stack?.hero_video_id ?? "",
    videoEngagementWistiaVideoId: row.stack?.video_engagement_meta?.wistia_video_id ?? "",
    videoEngagementYoutubeChannelId: row.stack?.video_engagement_meta?.youtube_channel_id ?? "",
    prospectResearchSourcesUsed: row.stack?.prospect_research_sources_used ?? [],
    // Credential values (video engagement / Apollo / PDL API keys) are
    // never returned, encrypted or not — same as any password field.
    // hasVideoEngagementCredential etc. would need resolveCredential; not
    // added here to keep this route read-only on secrets, matching how
    // the general wizard never showed existing credentials back either.
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const briefTriggerType: "nightly" | "dynamic_webhook" =
      body.briefTriggerType === "dynamic_webhook" ? "dynamic_webhook" : "nightly";
    const videoEngagementPlatform: string =
      typeof body.videoEngagementPlatform === "string" ? body.videoEngagementPlatform : "none";
    const heroVideoId: string = typeof body.heroVideoId === "string" ? body.heroVideoId.trim() : "";
    const videoEngagementWistiaVideoId: string =
      typeof body.videoEngagementWistiaVideoId === "string" ? body.videoEngagementWistiaVideoId.trim() : "";
    const videoEngagementYoutubeChannelId: string =
      typeof body.videoEngagementYoutubeChannelId === "string" ? body.videoEngagementYoutubeChannelId.trim() : "";
    const videoEngagementApiKey: string =
      typeof body.videoEngagementApiKey === "string" ? body.videoEngagementApiKey.trim() : "";
    const prospectResearchSourcesUsed: string[] = Array.isArray(body.prospectResearchSourcesUsed)
      ? body.prospectResearchSourcesUsed.filter((x: unknown) => x === "apollo" || x === "pdl")
      : [];
    const apolloApiKey: string = typeof body.apolloApiKey === "string" ? body.apolloApiKey.trim() : "";
    const pdlApiKey: string = typeof body.pdlApiKey === "string" ? body.pdlApiKey.trim() : "";

    const [row] = await db
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const mergedStack = {
      ...(row.stack ?? {}),
      brief_trigger_type: briefTriggerType,
      video_engagement_platform: videoEngagementPlatform,
      hero_video_id: heroVideoId || undefined,
      video_engagement_meta:
        videoEngagementPlatform !== "none"
          ? {
              wistia_video_id: videoEngagementWistiaVideoId || undefined,
              youtube_channel_id: videoEngagementYoutubeChannelId || undefined,
            }
          : undefined,
      prospect_research_sources_used: prospectResearchSourcesUsed.length > 0 ? prospectResearchSourcesUsed : undefined,
    } as EngagementStack;

    await db
      .update(engagements)
      .set({ stack: mergedStack, updatedAt: new Date() })
      .where(eq(engagements.engagementId, id));

    // Leaving a credential field blank on a revisit keeps whatever's
    // already stored — only a non-empty value overwrites it.
    if (videoEngagementApiKey && videoEngagementPlatform !== "none" && videoEngagementPlatform !== "loom") {
      await storeCredential(id, videoEngagementPlatform, `secrets://${id}/${videoEngagementPlatform}_key`, videoEngagementApiKey);
    }
    if (apolloApiKey && prospectResearchSourcesUsed.includes("apollo")) {
      await storeCredential(id, "apollo", `secrets://${id}/apollo_key`, apolloApiKey);
    }
    if (pdlApiKey && prospectResearchSourcesUsed.includes("pdl")) {
      await storeCredential(id, "pdl", `secrets://${id}/pdl_key`, pdlApiKey);
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/pre-call-read]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
