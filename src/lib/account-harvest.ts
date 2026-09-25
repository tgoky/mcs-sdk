// src/lib/account-harvest.ts
//
// Account-metadata harvest for providers connected through Composio OAuth
// (composio-providers.ts's PROVIDER_TOOLKIT_MAP). Called from the Composio
// callback when a connection is made for a specific client, and from the
// credential link route when a saved connection is reused for one.
// Paste-a-key providers (Cal.com, Twilio, the Cold Open ESPs) are harvested
// by paste-key-harvest.ts instead; Whop by its own connect flow.

import { mailchimpDatacenter } from "@/lib/outbound-urls";
import { fetchWithTimeout } from "@/lib/http";
import { upsertClientFact } from "@/lib/client-facts";
import { seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { normalizeVertical } from "@/lib/verticals";
import { klaviyoAuthorization } from "@/lib/klaviyo-auth";

export type HarvestableProvider =
  | "calendly"
  | "hubspot"
  | "klaviyo"
  | "mailchimp"
  | "slack";

export function isHarvestableProvider(provider: string): provider is HarvestableProvider {
  return [
    "calendly",
    "hubspot",
    "klaviyo",
    "mailchimp",
    "slack",
  ].includes(provider);
}

async function writeFact(
  engagementId: string,
  key: string,
  value: unknown,
  provider: string,
  evidence?: string
) {
  if (value === undefined || value === null || value === "") return null;
  await upsertClientFact(engagementId, key, value, { source: "account", sourceDetail: provider, evidence });
  return key;
}

const maybeSeedDomainFromAccount = seedPrimaryDomainFromUrl;

// ── 1. CALENDLY DEEP HARVESTER ──────────────────────────────────────────
async function harvestCalendly(engagementId: string, apiKey: string): Promise<string[]> {
  const written: (string | null)[] = [];

  const userRes = await fetchWithTimeout("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (userRes.ok) {
    const data = (await userRes.json()) as {
      resource?: { uri?: string; name?: string; email?: string; timezone?: string };
    };
    const resource = data.resource;
    const userUri = resource?.uri;

    written.push(await writeFact(engagementId, "bookingPlatform", "calendly", "calendly", "Connected via Calendly."));
    written.push(await writeFact(engagementId, "timezone", resource?.timezone, "calendly", "Calendly account timezone."));

    if (userUri) {
      try {
        const eventsRes = await fetchWithTimeout(
          `https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        if (eventsRes.ok) {
          const eventsData = (await eventsRes.json()) as {
            collection?: Array<{
              name?: string;
              custom_questions?: Array<{ name?: string; type?: string; required?: boolean }>;
            }>;
          };
          const bookingSchema = (eventsData.collection ?? []).map((evt) => ({
            eventName: evt.name,
            questions: evt.custom_questions?.map((q) => q.name) ?? [],
          }));
          if (bookingSchema.length > 0) {
            written.push(
              await writeFact(
                engagementId,
                "bookingFormSchema",
                bookingSchema,
                "calendly",
                "Harvested Calendly event type custom questions for Pre-Call Briefs."
              )
            );
          }
        }
      } catch {
        // Non-critical probe failure fallback
      }
    }
  }

  return written.filter((k): k is string => k !== null);
}

// ── 2. HUBSPOT DEEP HARVESTER ───────────────────────────────────────────
async function harvestHubSpot(engagementId: string, accessToken: string): Promise<string[]> {
  const written: (string | null)[] = [];

  const accountRes = await fetchWithTimeout("https://api.hubapi.com/account-info/v3/details", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (accountRes.ok) {
    const data = (await accountRes.json()) as { portalId?: number | string; timeZone?: string };
    written.push(await writeFact(engagementId, "emailPlatform", "hubspot", "hubspot", "Connected via HubSpot."));
    written.push(
      await writeFact(
        engagementId,
        "hubspotPortalId",
        data.portalId != null ? String(data.portalId) : undefined,
        "hubspot",
        "HubSpot Portal ID."
      )
    );
    written.push(await writeFact(engagementId, "timezone", data.timeZone, "hubspot", "HubSpot account timezone."));
  }

  try {
    const pipeRes = await fetchWithTimeout("https://api.hubapi.com/crm/v3/pipelines/deals", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (pipeRes.ok) {
      const pipeData = (await pipeRes.json()) as {
        results?: Array<{
          stages?: Array<{ stageId?: string; label?: string }>;
        }>;
      };
      const stages = pipeData.results?.flatMap((p) => p.stages ?? []) ?? [];
      const dispositions = {
        noShowStageId: stages.find((s) => /no[- ]?show/i.test(s.label ?? ""))?.stageId,
        canceledStageId: stages.find((s) => /cancel/i.test(s.label ?? ""))?.stageId,
        closedWonStageId: stages.find((s) => /closed[- ]?won|won/i.test(s.label ?? ""))?.stageId,
      };

      if (dispositions.noShowStageId || dispositions.canceledStageId) {
        written.push(
          await writeFact(
            engagementId,
            "crmDispositions",
            dispositions,
            "hubspot",
            "Auto-detected deal pipeline stages for Win-Back recovery."
          )
        );
      }
    }
  } catch {
    // Non-critical probe failure
  }

  return written.filter((k): k is string => k !== null);
}

// ── 3. KLAVIYO HARVESTER ────────────────────────────────────────────────
async function harvestKlaviyo(engagementId: string, apiKey: string): Promise<string[]> {
  const written: (string | null)[] = [];
  const res = await fetchWithTimeout("https://a.klaviyo.com/api/accounts", {
    headers: {
      Authorization: klaviyoAuthorization(apiKey),
      Revision: "2024-10-15",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Klaviyo accounts fetch failed [${res.status}]`);
  const data = await res.json();
  const attrs = data?.data?.[0]?.attributes;
  const contact = attrs?.contact_information;

  written.push(await writeFact(engagementId, "emailPlatform", "klaviyo", "klaviyo", "Connected via Klaviyo."));
  written.push(await writeFact(engagementId, "operatorName", contact?.organization_name, "klaviyo", "Klaviyo org name."));
  written.push(await writeFact(engagementId, "timezone", attrs?.timezone, "klaviyo", "Klaviyo account timezone."));
  await maybeSeedDomainFromAccount(engagementId, contact?.website_url);

  return written.filter((k): k is string => k !== null);
}

// ── 4. MAILCHIMP HARVESTER ──────────────────────────────────────────────
async function harvestMailchimp(engagementId: string, apiKey: string): Promise<string[]> {
  const dc = mailchimpDatacenter(apiKey);
  if (!dc) {
    throw new Error("Mailchimp API key is missing datacenter suffix (e.g. -us6).");
  }

  const res = await fetchWithTimeout(`https://${dc}.api.mailchimp.com/3.0/`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Mailchimp API root fetch failed [${res.status}]`);
  const data = (await res.json()) as {
    account_name?: string;
    account_timezone?: string;
    account_industry?: string;
    contact?: { company?: string };
  };

  const written: (string | null)[] = [];
  written.push(await writeFact(engagementId, "emailPlatform", "mailchimp", "mailchimp", "Connected via Mailchimp."));
  written.push(await writeFact(engagementId, "timezone", data.account_timezone, "mailchimp", "Mailchimp account timezone."));
  // Mailchimp's industry is free text. Store the list id when it maps onto
  // one; otherwise keep it as an unscored suggestion (never auto-applied)
  // for the website classifier to replace with a listed vertical.
  const industryId = normalizeVertical(data.account_industry);
  if (industryId) {
    written.push(await writeFact(engagementId, "offerVertical", industryId, "mailchimp", `Mailchimp account industry: ${data.account_industry}.`));
  } else if (typeof data.account_industry === "string" && data.account_industry.trim()) {
    await upsertClientFact(engagementId, "offerVertical", data.account_industry.trim(), {
      source: "llm",
      sourceDetail: "mailchimp",
      evidence: `Mailchimp account industry "${data.account_industry.trim()}" doesn't match a listed vertical.`,
    });
    written.push("offerVertical");
  }
  written.push(await writeFact(engagementId, "operatorName", data.account_name || data.contact?.company, "mailchimp", "Mailchimp account name."));

  return written.filter((k): k is string => k !== null);
}

// ── 5. SLACK CHANNEL HARVESTER ──────────────────────────────────────────
async function harvestSlack(engagementId: string, botToken: string): Promise<string[]> {
  // Every public, non-archived channel, following Slack's cursor paging
  // (response_metadata.next_cursor). Capped so a huge workspace can't make
  // this loop forever. Private channels would need the groups:read scope,
  // which isn't assumed here.
  const channels: Array<{ id: string; name: string }> = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const url =
      "https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=200" +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${botToken}` } });
    if (!res.ok) break;
    const data = (await res.json()) as {
      ok?: boolean;
      channels?: Array<{ id?: string; name?: string }>;
      response_metadata?: { next_cursor?: string };
    };
    if (!data.ok || !Array.isArray(data.channels)) break;
    for (const c of data.channels) if (c.id && c.name) channels.push({ id: c.id, name: `#${c.name}` });
    cursor = data.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  if (channels.length === 0) return [];
  const written = await writeFact(engagementId, "slackChannels", channels, "slack", "Public channels in the connected Slack workspace, for picking where briefs go.");
  return written ? [written] : [];
}

// ── 6. GHL BESPOKE HARVESTER ────────────────────────────────────────────
export async function harvestGHLLocation(
  engagementId: string,
  apiKey: string,
  locationId: string
): Promise<string[]> {
  const res = await fetchWithTimeout(
    `https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) throw new Error(`GHL location fetch failed [${res.status}]`);
  const payload = await res.json();
  const location = payload.location ?? payload;

  const written: (string | null)[] = [];
  written.push(await writeFact(engagementId, "bookingPlatform", "ghl_calendar", "ghl_calendar", "Connected via GoHighLevel."));
  written.push(await writeFact(engagementId, "timezone", location.timezone, "ghl_calendar", "GHL location timezone."));
  written.push(
    await writeFact(
      engagementId,
      "operatorName",
      location.business?.name || location.name,
      "ghl_calendar",
      "GHL business name."
    )
  );

  // operatorHandles is a platform -> handle map (repIdentityGraphs), not a
  // list — the platform is derived from GHL's own field name ("facebookUrl"
  // -> "facebook", "linkedIn" -> "linkedin") so it doesn't depend on
  // knowing GHL's exact key spellings.
  const socialHandles: Record<string, string> = {};
  for (const [key, value] of Object.entries(location.social ?? {})) {
    if (key === "googlePlacesId" || typeof value !== "string" || !value.trim()) continue;
    const platform = key.toLowerCase().replace(/url$/, "");
    if (platform) socialHandles[platform] = value.trim();
  }
  written.push(
    await writeFact(
      engagementId,
      "operatorHandles",
      Object.keys(socialHandles).length ? socialHandles : undefined,
      "ghl_calendar",
      "GHL social handles."
    )
  );

  await maybeSeedDomainFromAccount(engagementId, location.website || location.business?.website);
  import("@/lib/discover-client")
    .then(({ discoverClientIfNotYetCrawled }) => discoverClientIfNotYetCrawled(engagementId))
    .catch((err) => console.warn(`[account-harvest] post-GHL crawl failed for ${engagementId}:`, err));
  return written.filter((k): k is string => k !== null);
}

// ── GENERIC DISPATCHER ──────────────────────────────────────────────────
export async function harvestAccountMetadata(
  engagementId: string,
  provider: string,
  credentialValue: string
): Promise<{ factsWritten: string[] } | { error: string }> {
  if (!isHarvestableProvider(provider)) {
    return { factsWritten: [] };
  }
  try {
    let factsWritten: string[] = [];
    switch (provider) {
      case "calendly":
        factsWritten = await harvestCalendly(engagementId, credentialValue);
        break;
      case "hubspot":
        factsWritten = await harvestHubSpot(engagementId, credentialValue);
        break;
      case "klaviyo":
        factsWritten = await harvestKlaviyo(engagementId, credentialValue);
        break;
      case "mailchimp":
        factsWritten = await harvestMailchimp(engagementId, credentialValue);
        break;
      case "slack":
        factsWritten = await harvestSlack(engagementId, credentialValue);
        break;
    }

    // A harvest may have just seeded the domain (Klaviyo, GHL) — crawl the
    // site now if there's a domain and it hasn't been crawled yet.
    import("@/lib/discover-client")
      .then(({ discoverClientIfNotYetCrawled }) => discoverClientIfNotYetCrawled(engagementId))
      .catch((err) => console.warn(`[account-harvest] post-harvest crawl failed for ${engagementId}:`, err));

    return { factsWritten };
  } catch (err: any) {
    console.error(`[account-harvest] ${provider} harvest failed for engagement ${engagementId}:`, err);
    return { error: err?.message ?? "Unknown harvest error" };
  }
}