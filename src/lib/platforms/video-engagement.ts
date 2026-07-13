/**
 * Video Engagement Platform Clients — Pre-Call Read recovery gap 3.
 *
 * Read-only: pulls "has this prospect watched the confirmation-page video,
 * how much of it, and when" for the brief's Engagement History block. None
 * of these platforms expose a stable, universal "watch events for this
 * email address" query — video engagement is typically tracked by an
 * anonymous viewer ID or session, not an email address directly — so each
 * adapter here uses whatever identity-linking mechanism that platform
 * actually offers, and returns a null/empty result rather than guessing
 * when it can't confidently attribute a watch session to this specific
 * prospect.
 */

export interface VideoEngagementSummary {
  watched: boolean;
  percentWatched: number | null;
  lastWatchedAt: string | null;
  // Free-text, platform-specific detail worth surfacing verbatim in the
  // brief (e.g. "watched to the objection-handling chapter") when the
  // platform's API returns chapter/heatmap data — most don't, so this is
  // usually null.
  note: string | null;
}

const EMPTY: VideoEngagementSummary = { watched: false, percentWatched: null, lastWatchedAt: null, note: null };

// ── Vidalytics ───────────────────────────────────────────────────────────

/**
 * Vidalytics ties viewer analytics to an explicit "viewer ID" the buyer's
 * page passes in at video-embed time — this app has no way to know that
 * viewer ID from the booking/email alone unless the buyer's confirmation
 * page passes the prospect's email as the viewer ID (a supported but
 * buyer-configured pattern in Vidalytics, not guaranteed). This adapter
 * assumes that convention; if the buyer didn't set it up that way, it
 * correctly finds nothing rather than silently returning another
 * prospect's data.
 */
async function getVidalyticsEngagement(apiKey: string, videoId: string, prospectEmail: string): Promise<VideoEngagementSummary> {
  try {
    const res = await fetch(
      `https://api.vidalytics.com/v1/videos/${encodeURIComponent(videoId)}/viewers/${encodeURIComponent(prospectEmail)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) return EMPTY;
    const data = await res.json();
    if (!data || typeof data.percent_watched !== "number") return EMPTY;
    return {
      watched: data.percent_watched > 0,
      percentWatched: Math.round(data.percent_watched * 100),
      lastWatchedAt: data.last_viewed_at ?? null,
      note: null,
    };
  } catch {
    return EMPTY;
  }
}

// ── Wistia ───────────────────────────────────────────────────────────────

/**
 * Wistia's Stats API supports filtering the visitor list by email when
 * the buyer's embed captures it via Wistia's Turnstile email-gate feature
 * or a heatmap identity merge — same buyer-configuration caveat as
 * Vidalytics above.
 */
async function getWistiaEngagement(apiKey: string, videoId: string, prospectEmail: string): Promise<VideoEngagementSummary> {
  try {
    const res = await fetch(
      `https://api.wistia.com/v1/stats/medias/${encodeURIComponent(videoId)}/visitors.json?email=${encodeURIComponent(prospectEmail)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!res.ok) return EMPTY;
    const visitors = await res.json();
    const visitor = Array.isArray(visitors) ? visitors[0] : null;
    if (!visitor) return EMPTY;
    return {
      watched: (visitor.percent_viewed ?? 0) > 0,
      percentWatched: visitor.percent_viewed != null ? Math.round(visitor.percent_viewed * 100) : null,
      lastWatchedAt: visitor.last_updated ?? null,
      note: null,
    };
  } catch {
    return EMPTY;
  }
}

// ── YouTube Analytics ────────────────────────────────────────────────────

/**
 * YouTube Analytics has no per-viewer-identity querying at all — it's
 * aggregate-only by design (YouTube doesn't expose "did this specific
 * email address watch this video"). This adapter is honest about that
 * ceiling: it can report aggregate watch-time stats for the video as
 * context, but can never attribute engagement to one named prospect.
 * Included because the transfer analysis names YouTube analytics as one
 * of the four platforms to support, but every caller needs to know this
 * one is structurally different from the other three.
 */
async function getYouTubeAggregateContext(accessToken: string, channelId: string, videoId: string): Promise<VideoEngagementSummary> {
  try {
    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3D${encodeURIComponent(channelId)}&metrics=averageViewPercentage,views&filters=video%3D%3D${encodeURIComponent(videoId)}&startDate=2020-01-01&endDate=${new Date().toISOString().slice(0, 10)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return EMPTY;
    const data = await res.json();
    const row = data.rows?.[0];
    if (!row) return EMPTY;
    return {
      watched: (row[1] ?? 0) > 0, // views > 0
      percentWatched: row[0] != null ? Math.round(row[0]) : null, // averageViewPercentage (aggregate, not per-prospect)
      lastWatchedAt: null,
      note: "Aggregate video-level stats only — YouTube Analytics doesn't support per-viewer identity lookups, so this isn't specific to this prospect.",
    };
  } catch {
    return EMPTY;
  }
}

// ── Loom ─────────────────────────────────────────────────────────────────

/**
 * Loom's public API doesn't currently expose a per-viewer analytics
 * endpoint at all (viewer insights are a UI-only feature at the time of
 * writing). Rather than silently no-op or fabricate a plausible-looking
 * response, this returns a summary that says so explicitly — a caller
 * reading `note` will know why nothing came back, instead of assuming the
 * prospect simply hasn't watched.
 */
async function getLoomEngagement(): Promise<VideoEngagementSummary> {
  return {
    ...EMPTY,
    note: "Loom has no public viewer-analytics API — engagement can't be pulled automatically for this platform.",
  };
}

// ── Router ────────────────────────────────────────────────────────────────

export interface VideoEngagementTenantMeta {
  wistia_video_id?: string;
  youtube_channel_id?: string;
  loom_folder_id?: string;
}

export async function getVideoEngagementForProspect(
  platform: string,
  apiKey: string,
  meta: VideoEngagementTenantMeta | undefined,
  videoId: string | undefined,
  prospectEmail: string
): Promise<VideoEngagementSummary> {
  switch (platform) {
    case "vidalytics":
      if (!videoId) return EMPTY;
      return getVidalyticsEngagement(apiKey, videoId, prospectEmail);

    case "wistia": {
      const id = meta?.wistia_video_id ?? videoId;
      if (!id) return EMPTY;
      return getWistiaEngagement(apiKey, id, prospectEmail);
    }

    case "youtube_analytics": {
      if (!meta?.youtube_channel_id || !videoId) return EMPTY;
      return getYouTubeAggregateContext(apiKey, meta.youtube_channel_id, videoId);
    }

    case "loom":
      return getLoomEngagement();

    default:
      return EMPTY;
  }
}
