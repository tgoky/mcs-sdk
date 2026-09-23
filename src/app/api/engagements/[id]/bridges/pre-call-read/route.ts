import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { hasCredential, storeCredential } from "@/lib/credentials";
import { getClientFact } from "@/lib/client-facts";
import { showtimeConnectionSuggestions } from "@/lib/derived-suggestions";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Pre-Call Read's hinges — brief_trigger_type (nightly vs dynamic), video
 * engagement tracking, and Apollo/PDL prospect-research BYOK.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [row] = await db
    .select({ buyer: engagements.buyer, stack: engagements.stack })
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

  return NextResponse.json({
    buyer: row.buyer,
    briefTriggerType: row.stack?.brief_trigger_type ?? "nightly",
    videoEngagementPlatform: row.stack?.video_engagement_platform ?? "none",
    heroVideoId: row.stack?.hero_video_id ?? "",
    videoEngagementWistiaVideoId: row.stack?.video_engagement_meta?.wistia_video_id ?? "",
    videoEngagementYoutubeChannelId: row.stack?.video_engagement_meta?.youtube_channel_id ?? "",
    prospectResearchSourcesUsed: row.stack?.prospect_research_sources_used ?? [],
    // Required for briefs to go anywhere — previously only settable from
    // the Pin-Down dossier or Edit Stack Settings, not this page.
    briefLandingDestination: row.stack?.brief_landing_destination ?? null,
    slackWebhookUrl: row.stack?.slack_webhook_url ?? "",
    // Sign-in-with-Slack alternative to the webhook (slack-delivery.ts).
    slackConnected: await hasCredential(id, "slack"),
    slackChannelId: row.stack?.slack_channel_id ?? "",
    slackChannels: ((await getClientFact(id, "slackChannels"))?.value as Array<{ id: string; name: string }> | undefined) ?? [],
    // e.g. the hero video's host as the video-engagement platform, while
    // that field is still unset.
    suggestions: await showtimeConnectionSuggestions(id, row.stack ?? {}),
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

    // Only destinations deliverBrief can actually deliver to.
    const briefLandingDestination =
      typeof body.briefLandingDestination === "string" && body.briefLandingDestination.trim() ? body.briefLandingDestination.trim() : undefined;
    if (briefLandingDestination && briefLandingDestination !== "slack" && briefLandingDestination !== "crm_note") {
      return NextResponse.json({ error: `Briefs can't be delivered to "${briefLandingDestination}". Pick Slack or a CRM note.` }, { status: 400 });
    }
    const slackWebhookUrl = typeof body.slackWebhookUrl === "string" ? body.slackWebhookUrl.trim() : undefined;
    const slackChannelId = typeof body.slackChannelId === "string" ? body.slackChannelId.trim() : undefined;
    if (slackWebhookUrl && !/^https:\/\//i.test(slackWebhookUrl)) {
      return NextResponse.json({ error: "The Slack webhook URL must start with https://." }, { status: 400 });
    }

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
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    // Only a channel from the connected workspace's own list is accepted.
    let slackChannelPatch: Partial<EngagementStack> = {};
    if (slackChannelId !== undefined) {
      if (!slackChannelId) {
        slackChannelPatch = { slack_channel_id: undefined, slack_channel_name: undefined };
      } else {
        const channels = ((await getClientFact(id, "slackChannels"))?.value as Array<{ id: string; name: string }> | undefined) ?? [];
        const channel = channels.find((c) => c.id === slackChannelId);
        if (!channel) {
          return NextResponse.json({ error: "That Slack channel isn't in the connected workspace." }, { status: 400 });
        }
        slackChannelPatch = { slack_channel_id: channel.id, slack_channel_name: channel.name };
      }
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
      // Only touched when sent, so older callers of this route keep working.
      ...(briefLandingDestination ? { brief_landing_destination: briefLandingDestination } : {}),
      ...(slackWebhookUrl !== undefined ? { slack_webhook_url: slackWebhookUrl || undefined } : {}),
      ...(slackChannelId !== undefined ? slackChannelPatch : {}),
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