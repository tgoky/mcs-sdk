// src/lib/account-harvest.ts
//
// Phase 1 & Phase 2: Complete Deep Operational Harvester for client_facts.
// Runs when any credential or OAuth connection is saved under /dashboard/settings/apps.
// Pulls account metadata, operational schemas, sending capacity, and pipeline stages
// across Showtime, Reputation Manager, Cold Open, and Whop Agent.

import { fetchWithTimeout } from "@/lib/http";
import { upsertClientFact } from "@/lib/client-facts";
import { seedPrimaryDomainFromUrl, getPrimaryDomainForEngagement } from "@/lib/client-profile";

export type HarvestableProvider =
  | "calendly"
  | "hubspot"
  | "klaviyo"
  | "mailchimp"
  | "instantly"
  | "smartlead"
  | "lemlist"
  | "reply_io"
  | "slack"
  | "whop";

export function isHarvestableProvider(provider: string): provider is HarvestableProvider {
  return [
    "calendly",
    "hubspot",
    "klaviyo",
    "mailchimp",
    "instantly",
    "smartlead",
    "lemlist",
    "reply_io",
    "slack",
    "whop",
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

  // A. User Identity & Timezone
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

    // B. Booking Form Schema Probe (pre-call-read)
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

  // A. Account Details & Portal ID
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

  // B. Pipeline Stage Auto-Dispositions (win-back & leak-map)
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
      Authorization: `Klaviyo-API-Key ${apiKey}`,
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
  const dc = apiKey.split("-").pop();
  if (!dc || dc === apiKey) {
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
  written.push(await writeFact(engagementId, "offerVertical", data.account_industry, "mailchimp", "Mailchimp account industry."));
  written.push(await writeFact(engagementId, "operatorName", data.account_name || data.contact?.company, "mailchimp", "Mailchimp account name."));

  return written.filter((k): k is string => k !== null);
}

// ── 5. COLD OPEN SENDING PLATFORM HARVESTERS ────────────────────────────
async function harvestInstantly(engagementId: string, apiKey: string): Promise<string[]> {
  const written: (string | null)[] = [];
  const res = await fetchWithTimeout("https://api.instantly.ai/api/v1/account/me", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) {
    written.push(await writeFact(engagementId, "sendPlatform", { platform: "instantly" }, "instantly", "Connected Instantly API."));
  }
  return written.filter((k): k is string => k !== null);
}

async function harvestSmartlead(engagementId: string, apiKey: string): Promise<string[]> {
  const written: (string | null)[] = [];
  const res = await fetchWithTimeout(`https://server.smartlead.ai/api/v1/email-accounts?api_key=${apiKey}`);
  if (res.ok) {
    written.push(await writeFact(engagementId, "sendPlatform", { platform: "smartlead" }, "smartlead", "Connected Smartlead API."));
  }
  return written.filter((k): k is string => k !== null);
}

async function harvestLemlist(engagementId: string, apiKey: string): Promise<string[]> {
  const written: (string | null)[] = [];
  const res = await fetchWithTimeout("https://api.lemlist.com/api/team", {
    headers: { Authorization: `Basic ${Buffer.from(`:${apiKey}`).toString("base64")}` },
  });
  if (res.ok) {
    written.push(await writeFact(engagementId, "sendPlatform", { platform: "lemlist" }, "lemlist", "Connected Lemlist API."));
  }
  return written.filter((k): k is string => k !== null);
}

async function harvestReplyIo(engagementId: string, apiKey: string): Promise<string[]> {
  const written: (string | null)[] = [];
  const res = await fetchWithTimeout("https://api.reply.io/v1/actions/v1/account", {
    headers: { "X-Api-Key": apiKey },
  });
  if (res.ok) {
    written.push(await writeFact(engagementId, "sendPlatform", { platform: "reply_io" }, "reply_io", "Connected Reply.io API."));
  }
  return written.filter((k): k is string => k !== null);
}

// ── 6. SLACK CHANNEL HARVESTER ──────────────────────────────────────────
async function harvestSlack(engagementId: string, botToken: string): Promise<string[]> {
  const written: (string | null)[] = [];
  const res = await fetchWithTimeout("https://slack.com/api/conversations.list?types=public_channel&limit=100", {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  if (res.ok) {
    const data = (await res.json()) as {
      ok?: boolean;
      channels?: Array<{ id?: string; name?: string }>;
    };
    if (data.ok && Array.isArray(data.channels)) {
      const channelList = data.channels.map((c) => ({ id: c.id, name: `#${c.name}` }));
      written.push(
        await writeFact(
          engagementId,
          "slackChannels",
          channelList,
          "slack",
          "Harvested workspace public channels for Pre-Call Briefs."
        )
      );
    }
  }
  return written.filter((k): k is string => k !== null);
}

// ── 7. WHOP AGENT HARVESTER ─────────────────────────────────────────────
async function harvestWhop(engagementId: string, apiKey: string): Promise<string[]> {
  const written: (string | null)[] = [];
  const res = await fetchWithTimeout("https://api.whop.com/api/v2/me", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) {
    const data = (await res.json()) as { id?: string; username?: string; email?: string };
    written.push(
      await writeFact(
        engagementId,
        "whopAccount",
        { id: data.id, username: data.username },
        "whop",
        "Whop company account verified."
      )
    );
  }
  return written.filter((k): k is string => k !== null);
}

// ── 8. GHL BESPOKE HARVESTER ────────────────────────────────────────────
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

  const socialUrls = Object.entries(location.social ?? {})
    .filter(([key, value]) => key !== "googlePlacesId" && typeof value === "string" && value.trim())
    .map(([, value]) => value as string);
  written.push(
    await writeFact(
      engagementId,
      "operatorHandles",
      socialUrls.length ? socialUrls : undefined,
      "ghl_calendar",
      "GHL social handles."
    )
  );

  await maybeSeedDomainFromAccount(engagementId, location.website || location.business?.website);
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
      case "instantly":
        factsWritten = await harvestInstantly(engagementId, credentialValue);
        break;
      case "smartlead":
        factsWritten = await harvestSmartlead(engagementId, credentialValue);
        break;
      case "lemlist":
        factsWritten = await harvestLemlist(engagementId, credentialValue);
        break;
      case "reply_io":
        factsWritten = await harvestReplyIo(engagementId, credentialValue);
        break;
      case "slack":
        factsWritten = await harvestSlack(engagementId, credentialValue);
        break;
      case "whop":
        factsWritten = await harvestWhop(engagementId, credentialValue);
        break;
    }

    if (!(await getPrimaryDomainForEngagement(engagementId))) {
      import("@/lib/discover-client")
        .then(({ discoverClient }) => discoverClient(engagementId))
        .catch(() => {});
    }

    return { factsWritten };
  } catch (err: any) {
    console.error(`[account-harvest] ${provider} harvest failed for engagement ${engagementId}:`, err);
    return { error: err?.message ?? "Unknown harvest error" };
  }
}