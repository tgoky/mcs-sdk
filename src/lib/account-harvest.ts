// src/lib/account-harvest.ts
//
// Phase 1, piece 1 of the shared fact-store resolver work: the
// account-metadata half, matching discover-client.ts's website-crawl half.
// Runs once a credential is actually connected, pulling whatever that
// provider's own account-identity endpoint returns (portal ID, timezone,
// org name, website) and writing it into client_facts — the same store
// discoverClient writes into, so either trigger can supply a fact the
// other would otherwise have had to ask for.
//
// Covers all 5 of composio-providers.ts's PROVIDER_TOOLKIT_MAP now:
// Calendly, HubSpot, Klaviyo, Mailchimp through the generic dispatcher
// below; GHL (harvestGHLLocation) as a bespoke export instead — it needs
// a locationId the dispatcher's (engagementId, provider, credentialValue)
// signature has no slot for, and that value isn't confirmed reachable
// from the Composio OAuth path anyway (see harvestGHLLocation's own
// comment). Adding a provider to the dispatcher below means adding one
// function plus one case, not touching its callers.
//
// IMPORTANT — unverified except where noted: HubSpot's account-info
// payload, Klaviyo's accounts payload, and Calendly's users/me resource
// are built from this project's own prior research summaries, not a real
// call this session made against a live account — each reads defensively
// for exactly that reason. Mailchimp's harvestMailchimp is the one
// exception: its field names (account_name, account_timezone,
// account_industry, contact.company) are copied directly from Mailchimp's
// own API Root reference page, pasted into this session verbatim — same
// confirmed-contract standard as jev.ts.

import { fetchWithTimeout } from "@/lib/http";
import { upsertClientFact } from "@/lib/client-facts";
import { seedPrimaryDomainFromUrl, getPrimaryDomainForEngagement } from "@/lib/client-profile";

export type HarvestableProvider = "calendly" | "hubspot" | "klaviyo" | "mailchimp";

export function isHarvestableProvider(provider: string): provider is HarvestableProvider {
  return provider === "calendly" || provider === "hubspot" || provider === "klaviyo" || provider === "mailchimp";
}

async function writeFact(engagementId: string, key: string, value: unknown, provider: string, evidence?: string) {
  if (value === undefined || value === null || value === "") return null;
  await upsertClientFact(engagementId, key, value, { source: "account", sourceDetail: provider, evidence });
  return key;
}

/** Website URLs sometimes come back bare or with tracking params attached
 * — client-profile.ts's seedPrimaryDomainFromUrl already normalizes and
 * skips anything that isn't a usable host, so this is just a call-site
 * alias kept for readability at the two harvest sites below. */
const maybeSeedDomainFromAccount = seedPrimaryDomainFromUrl;

async function harvestCalendly(engagementId: string, apiKey: string): Promise<string[]> {
  // CalendlyClient has no public getter for the raw /users/me resource
  // today (its own resolveUserUri is private, cached internally) — a
  // direct fetch here, not a new public method on that class, since this
  // is the only caller that needs the full resource, not just the URI.
  const res = await fetchWithTimeout("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Calendly account fetch failed [${res.status}]`);
  const data = (await res.json()) as { resource?: { name?: string; email?: string; timezone?: string } };
  const resource = data.resource;

  const written: (string | null)[] = [];
  // Connecting Calendly at all IS choosing it as the booking platform —
  // no inference involved, this is definitional.
  written.push(await writeFact(engagementId, "bookingPlatform", "calendly", "calendly", "Connected via Calendly OAuth."));
  written.push(await writeFact(engagementId, "timezone", resource?.timezone, "calendly", "Calendly account's own timezone setting."));
  return written.filter((k): k is string => k !== null);
}

async function harvestHubSpot(engagementId: string, accessToken: string): Promise<string[]> {
  const res = await fetchWithTimeout("https://api.hubapi.com/account-info/v3/details", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HubSpot account-info fetch failed [${res.status}]`);
  const data = (await res.json()) as { portalId?: number | string; timeZone?: string };

  const written: (string | null)[] = [];
  written.push(await writeFact(engagementId, "emailPlatform", "hubspot", "hubspot", "Connected via HubSpot OAuth."));
  // Exact registry field key (worker-registry.ts's win-back.hubspotPortalId)
  // — the one field the registry itself currently describes as "not
  // derivable from anything on file," which this endpoint contradicts.
  written.push(await writeFact(engagementId, "hubspotPortalId", data.portalId != null ? String(data.portalId) : undefined, "hubspot", "HubSpot account-info API's own portalId."));
  written.push(await writeFact(engagementId, "timezone", data.timeZone, "hubspot", "HubSpot account's own timezone setting."));
  return written.filter((k): k is string => k !== null);
}

async function harvestKlaviyo(engagementId: string, apiKey: string): Promise<string[]> {
  const res = await fetchWithTimeout("https://a.klaviyo.com/api/accounts", {
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Revision: "2024-10-15",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Klaviyo accounts fetch failed [${res.status}]`);
  const data = await res.json();
  // Klaviyo's JSON:API shape nests the useful fields under
  // data.data[0].attributes.contact_information — read defensively, this
  // is the least-verified shape in this file (see module header).
  const attrs = data?.data?.[0]?.attributes;
  const contact = attrs?.contact_information;

  const written: (string | null)[] = [];
  written.push(await writeFact(engagementId, "emailPlatform", "klaviyo", "klaviyo", "Connected via Klaviyo OAuth."));
  written.push(await writeFact(engagementId, "operatorName", contact?.organization_name, "klaviyo", "Klaviyo account's own organization name."));
  written.push(await writeFact(engagementId, "timezone", attrs?.timezone, "klaviyo", "Klaviyo account's own timezone setting."));
  await maybeSeedDomainFromAccount(engagementId, contact?.website_url);
  return written.filter((k): k is string => k !== null);
}

/**
 * Mailchimp's own API Root reference confirms the exact fields used below
 * (account_name, account_timezone, account_industry, contact.company) —
 * pasted into this session directly, not inferred.
 *
 * Base URL requires a datacenter prefix Mailchimp doesn't return
 * separately — per Mailchimp's own Fundamentals docs, it's the suffix
 * already present on the API key itself (e.g. a key ending "-us6" means
 * https://us6.api.mailchimp.com/3.0/), so it's parsed from the same
 * credential value used for auth, not a second stored field.
 */
async function harvestMailchimp(engagementId: string, apiKey: string): Promise<string[]> {
  const dc = apiKey.split("-").pop();
  if (!dc || dc === apiKey) {
    throw new Error("Mailchimp API key is missing its datacenter suffix (expected a trailing -usN) — can't determine which API host to call.");
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
  written.push(await writeFact(engagementId, "emailPlatform", "mailchimp", "mailchimp", "Connected via Mailchimp OAuth."));
  written.push(await writeFact(engagementId, "timezone", data.account_timezone, "mailchimp", "Mailchimp API Root's own account_timezone."));
  // offerVertical is genuinely free text in this app (schema.ts's own
  // comment — no fixed taxonomy), so Mailchimp's own free-text industry
  // classification is a direct, no-inference-needed pass-through, not a
  // Jev classification the way trafficTemperature/castingChoice are.
  written.push(await writeFact(engagementId, "offerVertical", data.account_industry, "mailchimp", "Mailchimp API Root's own account_industry."));
  written.push(await writeFact(engagementId, "operatorName", data.account_name || data.contact?.company, "mailchimp", "Mailchimp API Root's own account_name."));
  return written.filter((k): k is string => k !== null);
}

/**
 * NOT dispatched through harvestAccountMetadata below, unlike the other 4
 * providers — GET /locations/{locationId} needs a locationId the generic
 * dispatcher has no slot for, and (found by checking this app's own
 * /api/integrations/ghl/locations/route.ts before wiring anything) a GHL
 * Private Integration Token has no list-locations endpoint to discover
 * one from — locationId has to already be known at the call site. That
 * route is the one place in this app that already has a verified key AND
 * a confirmed locationId together (it exists specifically to verify that
 * pairing), so it calls this directly, right after its own verification
 * succeeds — not the Composio callback, where a locationId isn't
 * confirmed to be available for the ghl_calendar OAuth path.
 *
 * Response shape, endpoint path, and the `location` root-wrapper are
 * pasted verbatim from GoHighLevel's own Get Location reference page —
 * same confidence tier as Mailchimp's harvester. One correction made
 * against this app's OWN already-working code, not the relayed docs: the
 * API version header here is "2021-07-28" (confirmed live in
 * ghl/locations/route.ts), not "v3" as relayed — trusted the app's own
 * functioning call over the secondhand doc reference for that one detail.
 */
export async function harvestGHLLocation(engagementId: string, apiKey: string, locationId: string): Promise<string[]> {
  const res = await fetchWithTimeout(`https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28", "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`GHL location fetch failed [${res.status}]`);
  const payload = await res.json();
  const location = payload.location ?? payload;

  const written: (string | null)[] = [];
  written.push(await writeFact(engagementId, "timezone", location.timezone, "ghl_calendar", "GHL location's own timezone."));
  written.push(await writeFact(engagementId, "operatorName", location.business?.name || location.name, "ghl_calendar", "GHL location's own business.name (or location name)."));
  // operatorHandles is registry-listed as "plausibly derivable... not
  // verified yet" (worker-registry.ts) — this is that verification. Only
  // the handle-bearing fields, skipping googlePlacesId (not a handle) and
  // any social entry GHL left unset.
  const socialUrls = Object.entries(location.social ?? {})
    .filter(([key, value]) => key !== "googlePlacesId" && typeof value === "string" && value.trim())
    .map(([, value]) => value as string);
  written.push(await writeFact(engagementId, "operatorHandles", socialUrls.length ? socialUrls : undefined, "ghl_calendar", "GHL location's own social profile URLs."));
  await maybeSeedDomainFromAccount(engagementId, location.website || location.business?.website);
  return written.filter((k): k is string => k !== null);
}

/**
 * Fires after a credential is connected — pulls that provider's account
 * metadata and writes whatever it can into the shared fact store. Never
 * throws past this point: a harvest failure (a scope the account doesn't
 * grant, a changed API shape) degrades to "nothing extra harvested," it
 * must never fail the credential connect itself, which already succeeded
 * by the time this runs.
 */
export async function harvestAccountMetadata(
  engagementId: string,
  provider: string,
  credentialValue: string
): Promise<{ factsWritten: string[] } | { error: string }> {
  if (!isHarvestableProvider(provider)) {
    return { factsWritten: [] };
  }
  try {
    let factsWritten: string[];
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
    }
    // An account can supply the domain before any crawl has happened — if
    // this engagement still has none on file, discoverClient never had
    // anything to work with either, so trigger it now that one may exist.
    if (!(await getPrimaryDomainForEngagement(engagementId))) {
      // Deliberately not awaited into the harvest's own success/failure —
      // a slow or failed crawl shouldn't make the credential connect (or
      // this harvest's own already-written facts) look like it failed.
      import("@/lib/discover-client").then(({ discoverClient }) => discoverClient(engagementId)).catch(() => {});
    }
    return { factsWritten };
  } catch (err: any) {
    console.error(`[account-harvest] ${provider} harvest failed for engagement ${engagementId}:`, err);
    return { error: err?.message ?? "Unknown harvest error" };
  }
}
