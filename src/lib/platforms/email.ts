/**
 * Email/CRM Platform Clients
 * Used by pile-on (sequence enrollment on booking.created)
 * and win-back (recovery sequence enrollment on booking.cancelled/no-show).
 *
 * Win-back deploys the 30-day cadence (5 emails + 3 SMS) as a native
 * automation in the buyer's platform — we enroll the prospect into that
 * pre-built flow/list, we don't run the cadence ourselves.
 */


import { fetchWithTimeout } from "@/lib/http";
import crypto from "crypto";
import nodemailer from "nodemailer";

// ── Platform response shapes ────────────────────────────────────────────
// Same rationale as the equivalent block in booking.ts: these cover only
// the fields this file actually reads, not each platform's full API
// surface. Every field is optional because that's the honest contract
// with an external API response.

interface KlaviyoFlowAction {
  id?: string;
  attributes?: {
    action_type?: string;
    settings?: { delay_seconds?: number };
  };
  relationships?: {
    "flow-messages"?: { data?: Array<{ id?: string }> };
  };
}
interface KlaviyoIncludedResource {
  id?: string;
  attributes?: {
    content?: { subject?: string; body?: string };
  };
}
interface KlaviyoFlowActionsResponse {
  data?: KlaviyoFlowAction[];
  included?: KlaviyoIncludedResource[];
}
interface KlaviyoEngagementEvent {
  id?: string;
  attributes?: {
    event_properties?: {
      $flow?: string;
      $campaign_id?: string;
      campaign_id?: string;
      [key: string]: unknown;
    };
  };
}
interface KlaviyoEventsResponse {
  data?: KlaviyoEngagementEvent[];
}

interface HubSpotWorkflow {
  id: string | number;
  name?: string;
}
interface HubSpotWorkflowsResponse {
  workflows?: HubSpotWorkflow[];
}
interface HubSpotDealProperties {
  dealstage?: string;
  createdate?: string;
  closedate?: string | null;
  hs_is_closed?: string;
  hs_is_closed_won?: string;
}
interface HubSpotDeal {
  id: string;
  properties: HubSpotDealProperties;
}
interface HubSpotDealsSearchResponse {
  results?: HubSpotDeal[];
}

interface GHLOpportunityRaw {
  id: string;
  status: string;
  dateAdded: string;
  pipelineStageId: string;
}
interface GHLOpportunitiesSearchResponse {
  opportunities?: GHLOpportunityRaw[];
}

// The fields these router functions read off an EngagementStack-derived
// object assembled ad hoc per call site (enrollment-service.ts,
// recovery-service.ts, brief-service.ts, etc.) — not the same shape as
// booking.ts's BookingPlatformMeta, which is a different EngagementStack
// sub-object entirely, so this gets its own local type.
export interface EmailRoutingMeta {
  target_list_id?: string;
  recovery_list_id?: string;
  location_id?: string;
  target_workflow_id?: string;
  recovery_workflow_id?: string;
  recovery_automation_id?: string;
  activecampaign_base_url?: string;
}
interface CrmNoteMeta {
  platform?: string;
  location_id?: string;
}

// ── Klaviyo ───────────────────────────────────────────────────────────────

export class KlaviyoClient {
  private baseUrl = "https://a.klaviyo.com/api";
  private headers: HeadersInit;

  constructor(apiKey: string) {
    this.headers = {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Revision: "2024-10-15",
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /**
   * Returns a list's current profile count. Verified against Klaviyo's
   * docs (developers.klaviyo.com/en/reference/get_list): profile_count is
   * only included when explicitly requested via
   * additional-fields[list]=profile_count, and that specific query
   * carries a much lower rate limit (1/s, 15/min) than the rest of the
   * API — worth remembering if this is ever called in a tight loop across
   * many lists.
   */
  async getListProfileCount(listId: string): Promise<number | null> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/lists/${listId}/?additional-fields[list]=profile_count`,
      { headers: this.headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.attributes?.profile_count ?? null;
  }

  /**
   * Pile-On recovery gap 4 (existing-sequence audit). Lists the buyer's
   * live email flows so the audit can find a candidate "existing pre-call
   * sequence" to score, without the operator having to hunt down a flow
   * ID by hand. Filtered client-side by name substring match since
   * Klaviyo's Flows API doesn't support a name-contains server-side
   * filter.
   */
  async findFlowsByNameContains(substrings: string[]): Promise<Array<{ id: string; name: string; status: string }>> {
    const res = await fetchWithTimeout(`${this.baseUrl}/flows/?filter=equals(status,'live')&page[size]=50`, {
      headers: this.headers,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const flows: Array<{ id: string; attributes: { name: string; status: string } }> = data.data ?? [];
    const lowered = substrings.map((s) => s.toLowerCase());
    return flows
      .filter((f) => lowered.some((s) => f.attributes.name.toLowerCase().includes(s)))
      .map((f) => ({ id: f.id, name: f.attributes.name, status: f.attributes.status }));
  }

  /**
   * Pulls every email action in a flow, with subject, body preview, and
   * (when available) send-delay-from-flow-start. Klaviyo's Flow API
   * exposes send-time triggers as separate "time-delay" flow actions
   * rather than a field on the email action itself, so sendDelayDays is
   * best-effort (summed across any time-delay actions preceding this
   * email in the flow graph) rather than guaranteed exact — good enough
   * for the audit's "roughly how spaced out is this" purpose, not
   * precise enough to rebuild the flow from.
   */
  async getFlowEmailActions(flowId: string): Promise<
    Array<{ subject: string; bodyPreview: string; sendDelayDays: number | null }>
  > {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/flows/${flowId}/flow-actions/?include=flow-messages`,
      { headers: this.headers }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as KlaviyoFlowActionsResponse;

    let cumulativeDelayDays = 0;
    const results: Array<{ subject: string; bodyPreview: string; sendDelayDays: number | null }> = [];

    for (const action of data.data ?? []) {
      const actionType: string = action.attributes?.action_type ?? "";
      if (actionType === "TIME_DELAY") {
        const seconds: number = action.attributes?.settings?.delay_seconds ?? 0;
        cumulativeDelayDays += seconds / 86400;
        continue;
      }
      if (actionType === "SEND_EMAIL") {
        const messageId = action.relationships?.["flow-messages"]?.data?.[0]?.id;
        const included = (data.included ?? []).find((inc) => inc.id === messageId);
        const subject = included?.attributes?.content?.subject ?? "(no subject found)";
        const bodyPreview = (included?.attributes?.content?.body ?? "").replace(/<[^>]+>/g, " ").slice(0, 500);
        results.push({ subject, bodyPreview, sendDelayDays: cumulativeDelayDays || null });
      }
    }
    return results;
  }

  /**
   * Enrolls a prospect into a Klaviyo list (triggers any flows listening to that list).
   * Used for both pile-on (target_list_id) and win-back (recovery_list_id).
   */
  async enrollInList(
    email: string,
    firstName: string,
    listId: string,
    customProperties: Record<string, string> = {}
  ): Promise<void> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/profile-subscription-bulk-create-jobs/`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          data: {
            type: "profile-subscription-bulk-create-job",
            attributes: {
              profiles: {
                data: [
                  {
                    type: "profile",
                    attributes: {
                      email,
                      first_name: firstName,
                      properties: customProperties,
                    },
                  },
                ],
              },
            },
            relationships: {
              list: { data: { type: "list", id: listId } },
            },
          },
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`Klaviyo list enrollment failed [${res.status}]: ${await res.text()}`);
    }
  }

  /**
   * Fetches profile engagement events for pre-call-read research context.
   */
  /**
   * Pre-Call Read recovery gap 7's exact documented signature is
   * `getProfileEngagement(prospectEmail, offerPileOnSequenceId)`. The
   * second parameter scopes results to a specific Pile-On flow/campaign
   * rather than every open/click event ever recorded on the profile.
   * Klaviyo's Events API filter DSL doesn't have a reliably-documented
   * server-side filter for "events belonging to flow X" across API
   * versions, so this over-fetches (same query as before) and then
   * filters client-side on whatever flow/campaign identifier the event's
   * properties actually carry. If `sequenceId` is omitted, or none of the
   * returned events carry an identifiable flow/campaign field, this falls
   * back to the full unscoped list rather than silently returning
   * nothing — a broader-than-requested engagement summary is more useful
   * to a closer than an empty one caused by a filter that didn't match.
   */
  async getProfileEngagement(email: string, sequenceId?: string): Promise<KlaviyoEngagementEvent[]> {
    // First resolve profile ID
    const profileRes = await fetchWithTimeout(`${this.baseUrl}/profiles/match/`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        data: { type: "profile", attributes: { email } },
      }),
    });
    if (!profileRes.ok) return [];
    const profileData = await profileRes.json();
    const profileId = profileData.data?.id;
    if (!profileId) return [];

    // Fetch open/click events
    const eventsRes = await fetchWithTimeout(
      `${this.baseUrl}/events/?filter=${encodeURIComponent(
        `equals(profile_id,"${profileId}"),contains-any(metric_id,["opened-email","clicked-email"])`
      )}&include=metric`,
      { headers: this.headers }
    );
    if (!eventsRes.ok) return [];
    const eventsData = (await eventsRes.json()) as KlaviyoEventsResponse;
    const allEvents: KlaviyoEngagementEvent[] = eventsData.data ?? [];

    if (!sequenceId) return allEvents;

    const scoped = allEvents.filter((event) => {
      const props = event.attributes?.event_properties ?? {};
      return props.$flow === sequenceId || props.$campaign_id === sequenceId || props.campaign_id === sequenceId;
    });

    // Fall back to the unscoped set if the scoping filter matched nothing
    // — see the doc comment above for why.
    return scoped.length > 0 ? scoped : allEvents;
  }

  /**
   * Attaches a brief as a note-style profile property (Klaviyo has no timeline notes,
   * so we write to a custom property visible in the profile view).
   */
  async attachBriefAsProfileNote(email: string, briefText: string): Promise<void> {
    const profileRes = await fetchWithTimeout(`${this.baseUrl}/profiles/match/`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        data: { type: "profile", attributes: { email } },
      }),
    });
    if (!profileRes.ok) return;
    const profileData = await profileRes.json();
    const profileId = profileData.data?.id;
    if (!profileId) return;

    await fetchWithTimeout(`${this.baseUrl}/profiles/${profileId}/`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({
        data: {
          type: "profile",
          id: profileId,
          attributes: {
            properties: { showtime_pre_call_brief: briefText },
          },
        },
      }),
    });
  }
  /**
   * Sets a profile property to signal "this person is out of win-back."
   * The buyer's Klaviyo flow is expected to have a conditional split
   * checking showtime_status != "win_back" (or checking rebooked_at is
   * set) as its exit condition — we don't run the cadence ourselves, so
   * writing this signal reliably is the one piece of the exit condition
   * that's actually our responsibility.
   */
  async setProfileProperty(
    email: string,
    properties: Record<string, string | boolean>
  ): Promise<void> {
    const profileRes = await fetchWithTimeout(`${this.baseUrl}/profiles/match/`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        data: { type: "profile", attributes: { email } },
      }),
    });
    if (!profileRes.ok) return;
    const profileData = await profileRes.json();
    const profileId = profileData.data?.id;
    if (!profileId) return;

    await fetchWithTimeout(`${this.baseUrl}/profiles/${profileId}/`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({
        data: { type: "profile", id: profileId, attributes: { properties } },
      }),
    });
  }
}

export class HubSpotClient {
  private baseUrl = "https://api.hubapi.com/crm/v3/objects";
  private headers: HeadersInit;

  constructor(accessToken: string) {
    this.headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
  }

  private async findContactId(email: string): Promise<string | null> {
    const res = await fetchWithTimeout(`${this.baseUrl}/contacts/search`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.id ?? null;
  }

  /**
   * Pile-On recovery gap 4 (existing-sequence audit). Uses HubSpot's
   * legacy Workflows v3 API (api.hubapi.com/automation/v3/workflows) to
   * find candidate existing pre-call workflows by name. Not independently
   * verified against a live HubSpot account (same caveat GHLCRMClient
   * already documents for its own opportunities-search pagination) — HubSpot
   * has been migrating workflow management toward newer endpoints, so
   * this is a best-effort read that fails safe (returns []) rather than
   * throwing if the endpoint shape has moved.
   */
  async findWorkflowsByNameContains(substrings: string[]): Promise<Array<{ id: string; name: string }>> {
    try {
      const res = await fetchWithTimeout("https://api.hubapi.com/automation/v3/workflows", { headers: this.headers });
      if (!res.ok) return [];
      const data = (await res.json()) as HubSpotWorkflowsResponse;
      const lowered = substrings.map((s) => s.toLowerCase());
      return (data.workflows ?? [])
        .filter((w) => lowered.some((s) => (w.name ?? "").toLowerCase().includes(s)))
        .map((w) => ({ id: String(w.id), name: w.name ?? "" }));
    } catch {
      return [];
    }
  }

  /**
   * Best-effort pull of a workflow's email actions. HubSpot's workflow
   * action schema varies significantly by workflow type and API version;
   * this reads what it can (action type "SINGLE_CONNECTION"/"DELAY" plus
   * any inline email content it finds) and returns an empty array rather
   * than throwing when the shape doesn't match what's expected — the
   * audit treats an empty read as "couldn't read this platform's
   * sequence content" and says so, rather than fabricating placeholder
   * email content.
   */
  async getWorkflowEmailActions(workflowId: string): Promise<
    Array<{ subject: string; bodyPreview: string; sendDelayDays: number | null }>
  > {
    try {
      const res = await fetchWithTimeout(`https://api.hubapi.com/automation/v3/workflows/${workflowId}`, { headers: this.headers });
      if (!res.ok) return [];
      const data = await res.json();
      let cumulativeDelayDays = 0;
      const results: Array<{ subject: string; bodyPreview: string; sendDelayDays: number | null }> = [];

      for (const action of data.actions ?? []) {
        if (action.type === "DELAY" && action.delayMillis) {
          cumulativeDelayDays += action.delayMillis / 86_400_000;
          continue;
        }
        if (action.type === "SINGLE_CONNECTION" && action.body?.subject) {
          results.push({
            subject: action.body.subject,
            bodyPreview: (action.body.body ?? "").replace(/<[^>]+>/g, " ").slice(0, 500),
            sendDelayDays: cumulativeDelayDays || null,
          });
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  async enrollInWorkflow(email: string, firstName: string): Promise<void> {
    // Upsert contact first
    const upsertRes = await fetchWithTimeout(`${this.baseUrl}/contacts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        properties: { email, firstname: firstName, showtime_status: "enrolled" },
      }),
    });
    // 409 = already exists, that's fine
    if (!upsertRes.ok && upsertRes.status !== 409) {
      throw new Error(`HubSpot contact upsert failed [${upsertRes.status}]`);
    }
  }

  /**
   * Win-Back recovery gap 6 — native reply-detection path. HubSpot's
   * webhook subscriptions are configured at the developer APP level, not
   * per-portal — this requires HUBSPOT_APP_ID (the app this account's
   * OAuth connection belongs to) to be set, which is a genuine
   * prerequisite, not an oversight to route around. If it's not
   * configured, this throws with a clear message rather than silently
   * pretending a subscription was created.
   */
  async subscribeToInboundConversations(receiverUrl: string): Promise<string> {
    const appId = process.env.HUBSPOT_APP_ID;
    if (!appId) {
      throw new Error(
        "HUBSPOT_APP_ID is not configured — HubSpot webhook subscriptions are registered at the developer app level, not per-portal, so this env var is required before a native Conversations subscription can be created."
      );
    }

    const res = await fetchWithTimeout(`https://api.hubapi.com/webhooks/v3/${appId}/subscriptions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        eventType: "conversation.newMessage",
        propertyName: "",
        active: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HubSpot webhook subscription creation failed [${res.status}]: ${body.slice(0, 300)}`);
    }

    // The subscription itself doesn't carry a target URL — that's set
    // once per app via the app's webhook settings (targetUrl), not per
    // subscription. This call registers the event type subscription;
    // receiverUrl is accepted for API-shape consistency with the other
    // subscribeWebhook methods in this codebase and logged for the
    // operator's own reference, not sent to HubSpot.
    const data = await res.json();
    console.log(`[hubspot] Conversations subscription ${data.id} created — ensure the app's webhook target URL is set to ${receiverUrl}.`);
    return String(data.id);
  }

  async enrollInRecoveryWorkflow(email: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;
    // Update lifecycle stage to trigger win-back workflows
    await fetchWithTimeout(`${this.baseUrl}/contacts/${contactId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({
        properties: { showtime_status: "win_back", hs_lead_status: "IN_PROGRESS" },
      }),
    });
  }

  /**
   * Sets one or more arbitrary contact properties. Generic counterpart to
   * markRebooked's inline property update — added so any future signal
   * (not just showtime_status) can be written without a new method per
   * property. HubSpot properties must exist on the account (created
   * manually or via the Properties API) before they can be set — same
   * assumption already baked into every other property write in this
   * class.
   */
  async setCustomProperty(
    email: string,
    properties: Record<string, string>
  ): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetchWithTimeout(`${this.baseUrl}/contacts/${contactId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({ properties }),
    });
  }

  /**
   * Returns every deal stage across all pipelines, with each stage's
   * isClosed/isClosedWon-equivalent metadata. Verified against HubSpot's
   * docs (GET /crm/v3/pipelines/deals) — note this is NOT under
   * /crm/v3/objects, unlike this.baseUrl, hence the separate full URL.
   */
  async getDealPipelineStages(): Promise<Map<string, { label: string; isClosed: boolean }>> {
    const res = await fetchWithTimeout("https://api.hubapi.com/crm/v3/pipelines/deals", {
      headers: this.headers,
    });
    const stageMap = new Map<string, { label: string; isClosed: boolean }>();
    if (!res.ok) return stageMap;
    const data = await res.json();
    for (const pipeline of data.results ?? []) {
      for (const stage of pipeline.stages ?? []) {
        stageMap.set(stage.id, {
          label: stage.label,
          isClosed: stage.metadata?.isClosed === "true",
        });
      }
    }
    return stageMap;
  }

  /**
   * Deals created on/after `since`, with the properties needed for
   * pipeline metrics. hs_is_closed / hs_is_closed_won are real, documented
   * HubSpot properties (confirmed via HubSpot's community docs examples)
   * that give win/loss/open status directly — no buyer-configured stage
   * mapping needed, unlike what the original audit assumed was required.
   */
  async searchDealsCreatedSince(since: Date): Promise<
    Array<{
      id: string;
      dealstage: string;
      createdate: string;
      closedate: string | null;
      isClosed: boolean;
      isClosedWon: boolean;
    }>
  > {
    const res = await fetchWithTimeout("https://api.hubapi.com/crm/v3/objects/deals/search", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: "createdate", operator: "GTE", value: since.getTime() }] },
        ],
        properties: ["dealstage", "createdate", "closedate", "hs_is_closed", "hs_is_closed_won"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as HubSpotDealsSearchResponse;
    return (data.results ?? []).map((d) => ({
      id: d.id,
      dealstage: d.properties.dealstage ?? "",
      createdate: d.properties.createdate ?? "",
      closedate: d.properties.closedate ?? null,
      isClosed: d.properties.hs_is_closed === "true",
      isClosedWon: d.properties.hs_is_closed_won === "true",
    }));
  }

  async attachTimelineNote(email: string, briefHtml: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetchWithTimeout(`${this.baseUrl}/notes`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        properties: {
          hs_note_body: briefHtml,
          hs_timestamp: Date.now().toString(),
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 202,
              },
            ],
          },
        ],
      }),
    });
  }

  /**
   * Signals "this contact rebooked, stop the win-back cadence." Always
   * updates the property (reliable, and the buyer's workflow enrollment
   * trigger/branch should key off it). Also attempts a direct workflow
   * unenroll as a best-effort belt-and-suspenders move — HubSpot's
   * workflow-enrollment API can be finicky across account tiers, so this
   * is wrapped so a failure here never blocks the property update from
   * having already landed.
   */
  async markRebooked(email: string, workflowId?: string, statusValue: string = "rebooked"): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetchWithTimeout(`${this.baseUrl}/contacts/${contactId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({
        properties: { showtime_status: statusValue },
      }),
    });

    if (workflowId) {
      try {
        await fetchWithTimeout(
          `https://api.hubapi.com/automation/v4/workflows/${workflowId}/enrollments/${contactId}`,
          { method: "DELETE", headers: this.headers }
        );
      } catch {
        // best-effort — the property update above is the reliable signal
      }
    }
  }
}

// ── ActiveCampaign ────────────────────────────────────────────────────────

export class ActiveCampaignClient {
  private headers: HeadersInit;
  private tagIdCache = new Map<string, string>();

  constructor(private baseUrl: string, apiKey: string) {
    // baseUrl format: https://ACCOUNT.api-us1.com/api/3
    this.headers = {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    };
  }

  /**
   * ActiveCampaign's contactTags.tag field is a numeric tag ID, not a
   * name — confirmed against ActiveCampaign's own docs example response
   * for POST /contactTags: {"contactTag": {"contact":"1", "tag":"20"}}.
   * Tags are a separate resource (GET/POST /tags) resolved by name via the
   * `search` query param; not found → create it. Cached per-instance so
   * repeated markRebooked calls for the same tag name don't re-resolve it.
   */
  private async resolveTagId(tagName: string): Promise<string | null> {
    if (this.tagIdCache.has(tagName)) return this.tagIdCache.get(tagName)!;

    try {
      const searchRes = await fetchWithTimeout(
        `${this.baseUrl}/tags?search=${encodeURIComponent(tagName)}`,
        { headers: this.headers }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const exact = (searchData.tags ?? []).find((t: { tag?: string; id?: string }) => t.tag === tagName);
        if (exact?.id) {
          this.tagIdCache.set(tagName, exact.id);
          return exact.id;
        }
      }

      const createRes = await fetchWithTimeout(`${this.baseUrl}/tags`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ tag: { tag: tagName, tagType: "contact" } }),
      });
      if (!createRes.ok) return null;
      const createData = await createRes.json();
      const id = createData.tag?.id;
      if (id) this.tagIdCache.set(tagName, id);
      return id ?? null;
    } catch {
      return null;
    }
  }

  async enrollInList(email: string, firstName: string, listId: string): Promise<void> {
    // Upsert contact
    const contactRes = await fetchWithTimeout(`${this.baseUrl}/contacts/sync`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        contact: { email, firstName },
      }),
    });
    if (!contactRes.ok) {
      throw new Error(`ActiveCampaign contact sync failed [${contactRes.status}]`);
    }
    const contactData = await contactRes.json();
    const contactId = contactData.contact?.id;
    if (!contactId) return;

    // Add to list
    await fetchWithTimeout(`${this.baseUrl}/contactLists`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        contactList: { list: listId, contact: contactId, status: 1 },
      }),
    });
  }

  private async findContactId(email: string): Promise<string | null> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/contacts?email=${encodeURIComponent(email)}`,
      { headers: this.headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.contacts?.[0]?.id ?? null;
  }

  /**
   * Signals "this contact rebooked, stop the win-back cadence" by tagging
   * the contact (reliable — the buyer's automation's "stop on tag" exit
   * condition should key off this) and, best-effort, removing them from
   * the specific recovery automation if we can resolve the contactAutomation
   * association ID.
   */
  /**
   * Signals "this contact rebooked, stop the win-back cadence" by tagging
   * the contact (reliable — the buyer's automation's "stop on tag" exit
   * condition should key off this) and, best-effort, removing them from
   * the specific recovery automation if we can resolve the contactAutomation
   * association ID.
   */
  async markRebooked(email: string, automationId?: string, statusTag: string = "showtime_rebooked"): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    const tagId = await this.resolveTagId(statusTag);
    if (tagId) {
      await fetchWithTimeout(`${this.baseUrl}/contactTags`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
      }).catch(() => {});
    }

    if (automationId) {
      try {
        const assocRes = await fetchWithTimeout(
          `${this.baseUrl}/contactAutomations?filters[contact]=${contactId}&filters[automation]=${automationId}`,
          { headers: this.headers }
        );
        if (assocRes.ok) {
          const assocData = await assocRes.json();
          const contactAutomationId = assocData.contactAutomations?.[0]?.id;
          if (contactAutomationId) {
            await fetchWithTimeout(`${this.baseUrl}/contactAutomations/${contactAutomationId}`, {
              method: "DELETE",
              headers: this.headers,
            });
          }
        }
      } catch (apiErr: unknown) {
        // ✅ Enhanced defensive error logging to keep external API drift visible
        const message = apiErr instanceof Error ? apiErr.message : String(apiErr);
        console.warn(`[activecampaign-exit] Direct unenrollment skipped, falling back to tag-exits: ${message}`);
      }
    }
  }
}

// ── GHL CRM ───────────────────────────────────────────────────────────────

export class GHLCRMClient {
  private baseUrl = "https://services.leadconnectorhq.com";
  private headers: HeadersInit;

  constructor(apiKey: string, private locationId: string) {
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    };
  }

  private async findContactId(email: string): Promise<string | null> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/contacts/?email=${encodeURIComponent(email)}&locationId=${this.locationId}`,
      { headers: this.headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.contacts?.[0]?.id ?? null;
  }

  async enrollInWorkflow(
    email: string,
    firstName: string,
    workflowId: string
  ): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetchWithTimeout(
      `${this.baseUrl}/contacts/${contactId}/workflow/${workflowId}`,
      { method: "POST", headers: this.headers }
    );
  }

  /**
   * Sets one or more arbitrary custom fields, generalizing the pattern
   * markRebooked already uses inline for showtime_status. GHL's custom
   * fields are referenced by string key on this endpoint (not a
   * pre-registered numeric ID like ActiveCampaign requires), so this is a
   * direct generalization rather than a new mechanism.
   *
   * A note on the exact shape: public GHL docs/examples are genuinely
   * inconsistent here — some show {key, field_value} (the shape used
   * here and already established by markRebooked elsewhere in this same
   * class), others show {id, value} referencing a pre-looked-up internal
   * field ID. Kept consistent with this codebase's existing, pre-existing
   * convention rather than switching to the competing shape on the
   * strength of an equally-unverified claim — but this is worth a real
   * test against a live GHL account before depending on it heavily, since
   * neither shape was confirmed with full certainty from public docs alone.
   */
  async setCustomFields(email: string, fields: Record<string, string>): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetchWithTimeout(`${this.baseUrl}/contacts/${contactId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({
        customFields: Object.entries(fields).map(([key, field_value]) => ({ key, field_value })),
      }),
    }).catch(() => {});
  }

  /**
   * Opportunities created on/after `since`. GHL's opportunity `status`
   * field is a fixed, non-customizable 4-value enum — "open" | "won" |
   * "lost" | "abandoned" (confirmed directly from GHL's own support
   * docs) — so, like HubSpot's hs_is_closed/hs_is_closed_won, this needs
   * no buyer-configured stage-name mapping to compute win/loss.
   *
   * One thing NOT independently confirmed: the exact pagination
   * parameter names for this specific endpoint. GHL's Contacts endpoint
   * confirmed uses startAfter/startAfterId cursor pagination; this
   * assumes Opportunities search follows the same platform-wide
   * convention rather than having verified it directly against a live
   * account. Capped at 3 pages (up to ~300 opportunities) as a safety
   * bound — if pagination silently doesn't advance for some account,
   * this fails safe (returns a partial, smaller-than-real dataset) rather
   * than looping.
   */
  async searchOpportunitiesCreatedSince(
    since: Date
  ): Promise<Array<{ id: string; status: string; dateAdded: string; pipelineStageId: string }>> {
    const results: Array<{ id: string; status: string; dateAdded: string; pipelineStageId: string }> = [];
    let startAfter: string | undefined;
    let startAfterId: string | undefined;

    for (let page = 0; page < 3; page++) {
      // GHL's own API changelog documents a breaking change for this
      // endpoint category: snake_case params (location_id, pipeline_id,
      // contact_id, assigned_to) were deleted in favor of camelCase
      // (locationId, pipelineId, contactId, assignedTo) — confirmed
      // directly from marketplace.gohighlevel.com/docs/Changelog, not
      // assumed. Matches the camelCase already used in findContactId
      // above for the Contacts endpoint.
      const params = new URLSearchParams({ locationId: this.locationId, limit: "100" });
      if (startAfter) params.set("startAfter", startAfter);
      if (startAfterId) params.set("startAfterId", startAfterId);

      const res = await fetchWithTimeout(`${this.baseUrl}/opportunities/search?${params.toString()}`, {
        headers: this.headers,
      });
      if (!res.ok) break;
      const data = (await res.json()) as GHLOpportunitiesSearchResponse;
      const opportunities: GHLOpportunityRaw[] = data.opportunities ?? [];
      if (opportunities.length === 0) break;

      let reachedCutoff = false;
      for (const opp of opportunities) {
        if (new Date(opp.dateAdded) < since) {
          reachedCutoff = true;
          continue;
        }
        results.push({
          id: opp.id,
          status: opp.status,
          dateAdded: opp.dateAdded,
          pipelineStageId: opp.pipelineStageId,
        });
      }

      if (reachedCutoff || opportunities.length < 100) break;
      const last = opportunities[opportunities.length - 1];
      startAfter = last.dateAdded;
      startAfterId = last.id;
    }

    return results;
  }

  async attachCRMNote(email: string, noteText: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetchWithTimeout(`${this.baseUrl}/contacts/${contactId}/notes`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ body: noteText }),
    });
  }

  /**
   * Signals "this contact rebooked, stop the win-back cadence." GHL's
   * workflow endpoint supports DELETE on the same path used to enroll, so
   * this is a direct removal rather than a property-based signal — the
   * cleanest of the four platforms for this specific exit condition.
   */
  async markRebooked(email: string, workflowId?: string, statusValue: string = "rebooked"): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetchWithTimeout(`${this.baseUrl}/contacts/${contactId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({ customFields: [{ key: "showtime_status", field_value: statusValue }] }),
    }).catch(() => {});

    if (workflowId) {
      try {
        await fetchWithTimeout(
          `${this.baseUrl}/contacts/${contactId}/workflow/${workflowId}`,
          { method: "DELETE", headers: this.headers }
        );
      } catch {
        // best-effort — the custom field update above is the reliable signal
      }
    }
  }
}

// ── Mailchimp ────────────────────────────────────────────────────────────

export class MailchimpClient {
  private baseUrl: string;
  private headers: HeadersInit;

  /**
   * Mailchimp API keys embed their datacenter as a suffix after the last
   * hyphen (e.g. "abc123...-us21"), which IS the account's API root —
   * confirmed against Mailchimp's own Quick Start docs — so there's no
   * separate "base URL" the buyer has to look up, unlike ActiveCampaign.
   */
  constructor(apiKey: string) {
    const dc = apiKey.includes("-") ? apiKey.slice(apiKey.lastIndexOf("-") + 1) : "";
    if (!dc) {
      throw new Error(
        `Mailchimp API key doesn't carry a datacenter suffix (expected e.g. "...-us21") — this doesn't look like a valid Mailchimp key.`
      );
    }
    this.baseUrl = `https://${dc}.api.mailchimp.com/3.0`;
    this.headers = {
      // Mailchimp's documented Basic Auth pattern: any non-empty username,
      // the API key as the password.
      Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    };
  }

  private subscriberHash(email: string): string {
    return crypto.createHash("md5").update(email.toLowerCase()).digest("hex");
  }

  /**
   * Upserts a member onto an audience (list) — creates if new, updates if
   * they already exist — so this is safe to call on every booking without
   * a separate existence check first, same shape as the other ESP clients'
   * enrollInList.
   */
  async enrollInList(email: string, firstName: string, listId: string, tags: string[] = []): Promise<void> {
    const hash = this.subscriberHash(email);
    const res = await fetchWithTimeout(`${this.baseUrl}/lists/${listId}/members/${hash}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({
        email_address: email,
        status_if_new: "subscribed",
        merge_fields: { FNAME: firstName },
      }),
    });
    if (!res.ok) {
      throw new Error(`Mailchimp list enrollment failed [${res.status}]: ${await res.text()}`);
    }
    if (tags.length) {
      await fetchWithTimeout(`${this.baseUrl}/lists/${listId}/members/${hash}/tags`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ tags: tags.map((name) => ({ name, status: "active" })) }),
      }).catch(() => {});
    }
  }

  /**
   * Sets a merge field on a member, creating the merge field on the
   * audience first if it doesn't exist yet. Mailchimp merge fields — unlike
   * ActiveCampaign's pre-registered numeric custom fields (see the caveat
   * on deliverPersonalizedIntro/deliverRescheduleLink below) — can be
   * created dynamically via this same API, so Mailchimp genuinely supports
   * both delivery methods rather than needing the ActiveCampaign-style
   * "not supported" fallback.
   */
  async setMergeField(listId: string, email: string, tag: string, value: string): Promise<void> {
    const hash = this.subscriberHash(email);
    const upperTag = tag.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 10); // Mailchimp merge tags: max 10 chars

    const patchRes = await fetchWithTimeout(`${this.baseUrl}/lists/${listId}/members/${hash}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({ merge_fields: { [upperTag]: value } }),
    });
    if (patchRes.ok) return;

    // Most likely cause of a non-2xx here: the merge field doesn't exist
    // on this audience yet. Create it, then retry once.
    const createRes = await fetchWithTimeout(`${this.baseUrl}/lists/${listId}/merge-fields`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ name: tag, tag: upperTag, type: "text" }),
    });
    if (!createRes.ok && createRes.status !== 400) {
      // A 400 here is most often "already exists" (race with a concurrent
      // request) — anything else is a real failure worth surfacing.
      throw new Error(`Mailchimp merge field creation failed [${createRes.status}]: ${await createRes.text()}`);
    }

    const retryRes = await fetchWithTimeout(`${this.baseUrl}/lists/${listId}/members/${hash}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({ merge_fields: { [upperTag]: value } }),
    });
    if (!retryRes.ok) {
      throw new Error(`Mailchimp merge field set failed [${retryRes.status}]: ${await retryRes.text()}`);
    }
  }

  /**
   * Signals "stop the win-back cadence" via tags, the same mechanism
   * ActiveCampaign's markRebooked uses — Mailchimp Customer Journeys (the
   * automation product that would run a recovery cadence) exits contacts
   * off tag add/remove, not a numeric field.
   */
  async markRebooked(listId: string, email: string, reason: "rebooked" | "reply_exited" = "rebooked"): Promise<void> {
    const hash = this.subscriberHash(email);
    await fetchWithTimeout(`${this.baseUrl}/lists/${listId}/members/${hash}/tags`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        tags: [{ name: reason === "reply_exited" ? "showtime_reply_exited" : "showtime_rebooked", status: "active" }],
      }),
    }).catch(() => {});
  }

  /** Root account ping — confirms the key (and the datacenter parsed from it) is valid. */
  async checkCredentialHealth(): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/`, { headers: this.headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Mailchimp credential check failed [${res.status}]: ${body.slice(0, 300)}`);
    }
  }
}

// ── ConvertKit ───────────────────────────────────────────────────────────

export class ConvertKitClient {
  private baseUrl = "https://api.convertkit.com/v3";

  constructor(private apiSecret: string) {}

  /** Subscribes to a form — ConvertKit's forms trigger any automations attached to them. */
  async enrollInForm(email: string, firstName: string, formId: string, fields: Record<string, string> = {}): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/forms/${formId}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_secret: this.apiSecret, email, first_name: firstName, fields }),
    });
    if (!res.ok) {
      throw new Error(`ConvertKit form subscribe failed [${res.status}]: ${await res.text()}`);
    }
  }

  /** Tags a subscriber — ConvertKit's tag-based automations trigger off this. */
  async tagSubscriber(email: string, tagId: string, firstName?: string, fields: Record<string, string> = {}): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/tags/${tagId}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_secret: this.apiSecret, email, first_name: firstName, fields }),
    });
    if (!res.ok) {
      throw new Error(`ConvertKit tag subscribe failed [${res.status}]: ${await res.text()}`);
    }
  }

  /**
   * Removes a tag — ConvertKit's v3 tag-unsubscribe endpoint is keyed by
   * email, same as tag-subscribe, no separate subscriber-ID lookup needed.
   */
  async untagSubscriber(email: string, tagId: string): Promise<void> {
    await fetchWithTimeout(`${this.baseUrl}/tags/${tagId}/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_secret: this.apiSecret, email }),
    }).catch(() => {});
  }

  private async findSubscriberId(email: string): Promise<number | null> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/subscribers?api_secret=${encodeURIComponent(this.apiSecret)}&email_address=${encodeURIComponent(email)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.subscribers?.[0]?.id ?? null;
  }

  /**
   * Sets one or more custom fields on an existing subscriber. Unlike
   * ActiveCampaign's pre-registered-numeric-ID requirement documented on
   * deliverPersonalizedIntro/deliverRescheduleLink below, ConvertKit custom
   * fields are referenced by string key and auto-created on first use —
   * no pre-registration needed, same as Mailchimp's merge fields above.
   */
  async setCustomFields(email: string, fields: Record<string, string>): Promise<void> {
    const id = await this.findSubscriberId(email);
    if (!id) return; // no-op for a subscriber that doesn't exist yet
    await fetchWithTimeout(`${this.baseUrl}/subscribers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_secret: this.apiSecret, fields }),
    }).catch(() => {});
  }

  /**
   * Signals "stop the win-back cadence." Removes the recovery tag (if
   * given) AND writes a status field — belt-and-suspenders, since some
   * buyers build their ConvertKit automation's exit condition off the tag
   * itself, others off a field, and this app has no way to know which
   * without asking during onboarding.
   */
  async markRebooked(tagId: string | undefined, email: string, reason: "rebooked" | "reply_exited" = "rebooked"): Promise<void> {
    if (tagId) {
      await this.untagSubscriber(email, tagId);
    }
    await this.setCustomFields(email, {
      showtime_status: reason,
      showtime_rebooked_at: new Date().toISOString(),
    });
  }

  /** Confirms the api_secret is valid. */
  async checkCredentialHealth(): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/account?api_secret=${encodeURIComponent(this.apiSecret)}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ConvertKit credential check failed [${res.status}]: ${body.slice(0, 300)}`);
    }
  }
}

// ── SMTP (direct-send) ───────────────────────────────────────────────────
//
// Unlike every ESP client above, raw SMTP has no list/flow/automation
// concept — there's no buyer-side platform to tag and let its own
// automation send. Selecting "smtp" makes this app the sender of record:
// it owns the win-back cadence's schedule itself via a durable Inngest
// sequence (src/inngest/win-back-email-smtp.ts), the same direct-send
// split sms.ts documents between Twilio/GHL SMS (direct-send) and
// hubspot_sms (tag-based, buyer's automation sends). Pile-On's pre-call
// sequence has no app-generated email content today — pileOnSequenceAssetMap
// is declared in schema.ts but never populated anywhere in this codebase —
// so SMTP can't support Pile-On yet; enrollInPreCallSequence's "smtp" case
// below says so explicitly rather than silently sending nothing.
//
// Credentials are stored as one JSON string through the existing generic
// credential blob (storeCredential/resolveCredential already treat every
// provider's secret as an opaque string), rather than adding new schema
// columns for host/port/etc — see parseSmtpCredential.

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean; // true for implicit TLS (typically port 465), false for STARTTLS (587) or plain (25)
  username: string;
  password: string;
  fromAddress: string;
  fromName?: string;
}

/**
 * Parses the JSON blob stored as the "smtp" credential value. Errors name
 * the specific missing field — a buyer pasting a malformed config should
 * get an actionable message, not a generic parse failure.
 */
export function parseSmtpCredential(raw: string): SmtpConfig {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'SMTP credential is not valid JSON — expected {"host","port","secure","username","password","fromAddress"}.'
    );
  }
  for (const key of ["host", "port", "username", "password", "fromAddress"] as const) {
    if (parsed?.[key] === undefined || parsed[key] === null || parsed[key] === "") {
      throw new Error(`SMTP credential is missing "${key}".`);
    }
  }
  return {
    host: String(parsed.host),
    port: Number(parsed.port),
    secure: Boolean(parsed.secure),
    username: String(parsed.username),
    password: String(parsed.password),
    fromAddress: String(parsed.fromAddress),
    fromName: parsed.fromName ? String(parsed.fromName) : undefined,
  };
}

export class SMTPClient {
  private transporter: ReturnType<typeof nodemailer.createTransport>;
  private fromHeader: string;

  constructor(config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
    });
    this.fromHeader = config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress;
  }

  /**
   * Sends one email. Content (subject/body) is expected to already be
   * fully authored — win-back's generated copy — since SMTP has no
   * separate CRM/merge-field layer to inject personalization into after
   * the fact the way the ESP clients above do; personalization has to be
   * baked in at content-generation time for this platform.
   */
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    const isHtml = /<[a-z][\s\S]*>/i.test(body);
    await this.transporter.sendMail({
      from: this.fromHeader,
      to,
      subject,
      ...(isHtml ? { html: body } : { text: body }),
    });
  }

  /** Confirms the SMTP credentials and connection actually work. */
  async checkCredentialHealth(): Promise<void> {
    await this.transporter.verify();
  }
}

// ── Router ────────────────────────────────────────────────────────────────

/**
 * Enrolls a prospect into the pre-call sequence for their platform.
 * Called by pile-on on booking.created.
 */
export async function enrollInPreCallSequence(
  platform: string,
  apiKey: string,
  email: string,
  firstName: string,
  meta: EmailRoutingMeta
): Promise<void> {
  switch (platform) {
    case "klaviyo":
      if (!meta.target_list_id) throw new Error("klaviyo pile-on requires target_list_id in stack");
      return new KlaviyoClient(apiKey).enrollInList(email, firstName, meta.target_list_id, {
        showtime_status: "booked",
      });

    case "hubspot":
      return new HubSpotClient(apiKey).enrollInWorkflow(email, firstName);

    case "activecampaign":
      if (!meta.target_list_id || !meta.activecampaign_base_url) {
        throw new Error("ActiveCampaign requires target_list_id and activecampaign_base_url in stack");
      }
      return new ActiveCampaignClient(meta.activecampaign_base_url, apiKey).enrollInList(
        email, firstName, meta.target_list_id
      );

    case "ghl":
      if (!meta.location_id || !meta.target_workflow_id) {
        throw new Error("GHL CRM pile-on requires location_id and target_workflow_id in stack");
      }
      return new GHLCRMClient(apiKey, meta.location_id).enrollInWorkflow(
        email, firstName, meta.target_workflow_id
      );

    case "mailchimp":
      if (!meta.target_list_id) throw new Error("Mailchimp pile-on requires target_list_id (audience ID) in stack");
      return new MailchimpClient(apiKey).enrollInList(email, firstName, meta.target_list_id, ["showtime_booked"]);

    case "convertkit":
      if (!meta.target_list_id) throw new Error("ConvertKit pile-on requires target_list_id (form ID) in stack");
      return new ConvertKitClient(apiKey).enrollInForm(email, firstName, meta.target_list_id);

    case "smtp":
      // Direct-send platforms have no ESP-side flow to enroll into — this
      // app would need to own the send schedule itself, the same way it
      // does for win-back below. That schedule needs generated content to
      // send, and Pile-On's pre-call sequence has none today
      // (pileOnSequenceAssetMap is declared in schema.ts but never
      // populated). Rather than silently enrolling nobody, this is a hard,
      // actionable failure: connect an ESP for email_platform to run
      // Pile-On, or keep SMTP reserved for Win-Back's recovery cadence
      // (see win-back's dispatch below, which does have generated content).
      throw new Error(
        "SMTP has no Pile-On pre-call content to send yet — this direct-send platform is currently only wired for the Win-Back recovery cadence. Use klaviyo, hubspot, activecampaign, ghl, mailchimp, or convertkit for Pile-On."
      );

    default:
      throw new Error(
        `Unsupported email platform for sequence enrollment: ${platform}. ` +
        "Supported: klaviyo, hubspot, activecampaign, ghl, mailchimp, convertkit"
      );
  }
}

/**
 * Enrolls a cancelled/no-show prospect into the win-back recovery cadence.
 * Called by win-back on booking.cancelled / booking.no-showed.
 */
export async function enrollInWinBackSequence(
  platform: string,
  apiKey: string,
  email: string,
  firstName: string,
  meta: EmailRoutingMeta
): Promise<void> {
  switch (platform) {
    case "klaviyo":
      if (!meta.recovery_list_id) throw new Error("klaviyo win-back requires recovery_list_id in stack");
      return new KlaviyoClient(apiKey).enrollInList(email, firstName, meta.recovery_list_id, {
        showtime_status: "win_back",
      });

    case "hubspot":
      return new HubSpotClient(apiKey).enrollInRecoveryWorkflow(email);

    case "activecampaign":
      if (!meta.recovery_list_id || !meta.activecampaign_base_url) {
        throw new Error("ActiveCampaign win-back requires recovery_list_id and activecampaign_base_url");
      }
      return new ActiveCampaignClient(meta.activecampaign_base_url, apiKey).enrollInList(
        email, firstName, meta.recovery_list_id
      );

    case "ghl":
      if (!meta.location_id || !meta.recovery_workflow_id) {
        throw new Error("GHL CRM win-back requires location_id and recovery_workflow_id in stack");
      }
      return new GHLCRMClient(apiKey, meta.location_id).enrollInWorkflow(
        email, firstName, meta.recovery_workflow_id
      );

    case "mailchimp":
      if (!meta.recovery_list_id) throw new Error("Mailchimp win-back requires recovery_list_id (audience ID) in stack");
      return new MailchimpClient(apiKey).enrollInList(email, firstName, meta.recovery_list_id, ["showtime_win_back"]);

    case "convertkit":
      if (!meta.recovery_list_id) throw new Error("ConvertKit win-back requires recovery_list_id (tag ID) in stack");
      return new ConvertKitClient(apiKey).tagSubscriber(email, meta.recovery_list_id, firstName);

    case "smtp":
      // No-op by design. SMTP has no ESP-side list/tag to enroll into —
      // this app owns the send schedule itself via a durable Inngest
      // sequence started separately once the win-back enrollment row
      // exists (see enrollment-service.ts and
      // src/inngest/win-back-email-smtp.ts), using the same emails
      // already generated in winBackSequenceAssetMap for every platform.
      // Nothing to do here.
      return;

    default:
      throw new Error(`Unsupported email platform for win-back: ${platform}`);
  }
}

/**
 * Fires the "stop the win-back cadence" exit signal for a prospect who just
 * rebooked. Called on every booking.created event, not just ones we know
 * came from a prior cancellation — resolving whether someone was
 * previously win-back-enrolled would require a lookup we don't have a
 * cheap path to, and the signal itself is a harmless no-op for prospects
 * who were never in the recovery flow. This is the one piece of the
 * "stop pestering someone who already came back" requirement that is
 * actually our responsibility, since the cadence itself runs as a native
 * automation in the buyer's platform, not in our worker.
 */
/**
 * Removes a prospect from the active win-back cadence. `reason` controls
 * what actually gets written as the buyer-facing status — "rebooked"
 * (default, backward-compatible with the original rebook-exit call site
 * in enrollment-service.ts) or "reply_exited" (Win-Back recovery gap 6 —
 * a prospect who replied didn't necessarily rebook, and telling the
 * buyer's CRM they did would be actively misleading). The mechanical
 * side of exiting — removing from the workflow/automation — is identical
 * either way; only the label differs.
 */
export async function exitWinBackSequence(
  platform: string,
  apiKey: string,
  email: string,
  meta: EmailRoutingMeta,
  reason: "rebooked" | "reply_exited" = "rebooked"
): Promise<void> {
  switch (platform) {
    case "klaviyo":
      return new KlaviyoClient(apiKey).setProfileProperty(email, {
        showtime_status: reason,
        rebooked_at: new Date().toISOString(),
      });

    case "hubspot":
      return new HubSpotClient(apiKey).markRebooked(email, meta.recovery_workflow_id, reason);

    case "activecampaign":
      if (!meta.activecampaign_base_url) return;
      return new ActiveCampaignClient(meta.activecampaign_base_url, apiKey).markRebooked(
        email,
        meta.recovery_automation_id,
        reason === "reply_exited" ? "showtime_reply_exited" : "showtime_rebooked"
      );

    case "ghl":
      if (!meta.location_id) return;
      return new GHLCRMClient(apiKey, meta.location_id).markRebooked(
        email,
        meta.recovery_workflow_id,
        reason
      );

    case "mailchimp":
      if (!meta.recovery_list_id) return;
      return new MailchimpClient(apiKey).markRebooked(meta.recovery_list_id, email, reason);

    case "convertkit":
      return new ConvertKitClient(apiKey).markRebooked(meta.recovery_list_id, email, reason);

    case "smtp":
      // No external system to signal — the caller flips the win-back
      // enrollment row's status to inactive separately, and that status
      // flip is exactly what the running processWinBackEmailSmtpSequence
      // durable function checks before each send (see
      // src/inngest/win-back-email-smtp.ts). Nothing to do here.
      return;

    default:
      // No exit signal path for this platform — not fatal, just nothing to do.
      return;
  }
}

/**
 * Delivers a hybrid-mode personalized intro to the prospect's ESP profile
 * as a custom property, so the buyer's own confirmation email template can
 * pull it in via a merge tag (e.g. Klaviyo's {{ event.showtime_personalized_intro }}).
 * This app never sends transactional email directly — every delivery path
 * in this file works by tagging the buyer's own platform and letting their
 * existing automation act on it, and this is no different.
 *
 * ActiveCampaign is the one platform this can't support today: unlike the
 * other three, AC's custom-field API requires a pre-registered *numeric*
 * field ID (fieldValues endpoint), not an arbitrary string key — and
 * nothing in this app's onboarding flow currently collects that ID from
 * the buyer. Documented honestly as unsupported rather than silently
 * no-op'd, so callers can surface it as a real open item.
 */
export async function deliverPersonalizedIntro(
  platform: string,
  apiKey: string,
  email: string,
  text: string,
  meta: EmailRoutingMeta = {}
): Promise<void> {
  switch (platform) {
    case "klaviyo":
      return new KlaviyoClient(apiKey).setProfileProperty(email, {
        showtime_personalized_intro: text,
      });

    case "hubspot":
      return new HubSpotClient(apiKey).setCustomProperty(email, {
        showtime_personalized_intro: text,
      });

    case "ghl":
      if (!meta.location_id) throw new Error("GHL personalized-intro delivery requires location_id in stack");
      return new GHLCRMClient(apiKey, meta.location_id).setCustomFields(email, {
        showtime_personalized_intro: text,
      });

    case "mailchimp": {
      const mailchimpListId = meta.target_list_id ?? meta.recovery_list_id;
      if (!mailchimpListId) {
        throw new Error("Mailchimp personalized-intro delivery requires target_list_id or recovery_list_id in stack");
      }
      return new MailchimpClient(apiKey).setMergeField(mailchimpListId, email, "SHOWINTRO", text);
    }

    case "convertkit":
      return new ConvertKitClient(apiKey).setCustomFields(email, {
        showtime_personalized_intro: text,
      });

 case "activecampaign":
      // 🌟 THE FIX: Throwing flags the upstream hybrid budget wrapper to accurately log a "fallback" outcome
      throw new Error(
        "ActiveCampaign requires a pre-registered numeric custom field ID for this, which isn't collected during onboarding yet — not supported."
      );

    case "smtp":
      // Not applicable — SMTP content is fully authored at generation
      // time (see recovery-service.ts), there's no separate CRM profile
      // to tag after the fact the way the ESP clients above work.
      throw new Error(
        "SMTP renders fully-authored content directly, so there's no separate personalized-intro delivery step for it — not supported."
      );

    default:
      throw new Error(`Unsupported email platform for personalized-intro delivery: ${platform}`);
  }
}

/**
 * Win-Back recovery gap 3 — sets the per-prospect fresh reschedule link
 * (or the time_slots fallback URL) as a contact property, so the
 * recovery cadence's generated copy — which references
 * `{{ showtime_reschedule_link }}` in fresh_link mode instead of a
 * literal URL, see RESCHEDULE_LINK_MERGE in recovery-service.ts — merges
 * in the right link per prospect. Same buyer's-platform-renders-our-
 * merge-field pattern as deliverPersonalizedIntro above, and the same
 * ActiveCampaign limitation applies for the same reason (no arbitrary
 * custom-field API without a pre-registered numeric field ID).
 */
export async function deliverRescheduleLink(
  platform: string,
  apiKey: string,
  email: string,
  url: string,
  meta: EmailRoutingMeta = {}
): Promise<void> {
  switch (platform) {
    case "klaviyo":
      return new KlaviyoClient(apiKey).setProfileProperty(email, {
        showtime_reschedule_link: url,
      });

    case "hubspot":
      return new HubSpotClient(apiKey).setCustomProperty(email, {
        showtime_reschedule_link: url,
      });

    case "ghl":
      if (!meta.location_id) throw new Error("GHL reschedule-link delivery requires location_id in stack");
      return new GHLCRMClient(apiKey, meta.location_id).setCustomFields(email, {
        showtime_reschedule_link: url,
      });

    case "mailchimp": {
      const mailchimpListId = meta.target_list_id ?? meta.recovery_list_id;
      if (!mailchimpListId) {
        throw new Error("Mailchimp reschedule-link delivery requires target_list_id or recovery_list_id in stack");
      }
      return new MailchimpClient(apiKey).setMergeField(mailchimpListId, email, "SHOWRESKED", url);
    }

    case "convertkit":
      return new ConvertKitClient(apiKey).setCustomFields(email, {
        showtime_reschedule_link: url,
      });

    case "activecampaign":
      // 🌟 THE FIX: Throwing flags the upstream hybrid budget wrapper to accurately log a "fallback" outcome
      throw new Error(
        "ActiveCampaign requires a pre-registered numeric custom field ID for this, which isn't collected during onboarding yet — not supported."
      );

    case "smtp":
      // Not applicable — same reasoning as deliverPersonalizedIntro above.
      throw new Error(
        "SMTP renders fully-authored content directly, so there's no separate reschedule-link delivery step for it — not supported."
      );

    default:
      throw new Error(`Unsupported email platform for reschedule-link delivery: ${platform}`);
  }
}

/**
 * Delivers a pre-call brief to the configured destination.
 * Called by pre-call-read after brief synthesis.
 */
// Tier 4 #27 — Slack interactive brief buttons. Shared between the button
// labels here and the interaction handler's outcome parsing
// (src/app/api/webhooks/slack/interactions/route.ts) — kept as one
// source rather than duplicating the three outcome strings in both files.
export const OUTCOME_BUTTON_LABEL: Record<"showed" | "no_show" | "rescheduled", string> = {
  showed: "✅ Showed",
  no_show: "❌ No-show",
  rescheduled: "🔁 Rescheduled",
};

export async function deliverBrief(
  destination: string,
  briefText: string,
  email: string,
  slackWebhookUrl?: string,
  crmApiKey?: string,
  crmMeta?: CrmNoteMeta,
  // Tier 4 #27 — Slack interactive brief buttons. Optional and additive:
  // omitting it (every existing call site keeps working unchanged)
  // delivers the exact same plain Block Kit message as before. Passing it
  // adds a row of Show/No-show/Rescheduled buttons whose `value` encodes
  // just enough for the interaction handler
  // (src/app/api/webhooks/slack/interactions/route.ts) to log the
  // outcome without a round trip back to this function.
  slackButtonContext?: { engagementId: string; bookingId: string; prospectEmail: string }
): Promise<void> {
  switch (destination) {
    case "slack":
      if (!slackWebhookUrl) {
        throw new Error("Slack delivery requires slack_webhook_url on engagement stack");
      }
      await fetchWithTimeout(slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: briefText },
            },
            ...(slackButtonContext
              ? [
                  {
                    type: "actions",
                    block_id: "brief_outcome",
                    elements: (["showed", "no_show", "rescheduled"] as const).map((outcome) => ({
                      type: "button",
                      text: { type: "plain_text", text: OUTCOME_BUTTON_LABEL[outcome] },
                      style: outcome === "showed" ? "primary" : outcome === "no_show" ? "danger" : undefined,
                      action_id: `brief_outcome_${outcome}`,
                      value: JSON.stringify({ ...slackButtonContext, outcome }),
                    })),
                  },
                ]
              : []),
          ],
        }),
      });
      break;

    case "crm_note":
      if (!crmApiKey || !crmMeta?.platform) {
        throw new Error("CRM note delivery requires a connected CRM platform and API key");
      }
      switch (crmMeta.platform) {
        case "hubspot":
          await new HubSpotClient(crmApiKey).attachTimelineNote(email, briefText);
          break;
        case "klaviyo":
          await new KlaviyoClient(crmApiKey).attachBriefAsProfileNote(email, briefText);
          break;
        case "ghl":
          if (!crmMeta.location_id) throw new Error("GHL CRM note requires location_id");
          await new GHLCRMClient(crmApiKey, crmMeta.location_id).attachCRMNote(email, briefText);
          break;
        default:
          throw new Error(`CRM note delivery not supported for platform: ${crmMeta.platform}`);
      }
      break;

    default:
      // calendar_event delivery not universally supported — fall back to Slack if configured
      if (slackWebhookUrl) {
        await fetchWithTimeout(slackWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: briefText }),
        });
      }
  }
}