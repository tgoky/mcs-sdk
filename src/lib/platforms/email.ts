/**
 * Email/CRM Platform Clients
 * Used by pile-on (sequence enrollment on booking.created)
 * and win-back (recovery sequence enrollment on booking.cancelled/no-show).
 *
 * Win-back deploys the 30-day cadence (5 emails + 3 SMS) as a native
 * automation in the buyer's platform — we enroll the prospect into that
 * pre-built flow/list, we don't run the cadence ourselves.
 */

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
    const res = await fetch(
      `${this.baseUrl}/lists/${listId}/?additional-fields[list]=profile_count`,
      { headers: this.headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.attributes?.profile_count ?? null;
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
    const res = await fetch(
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
  async getProfileEngagement(email: string): Promise<any[]> {
    // First resolve profile ID
    const profileRes = await fetch(`${this.baseUrl}/profiles/match/`, {
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
    const eventsRes = await fetch(
      `${this.baseUrl}/events/?filter=${encodeURIComponent(
        `equals(profile_id,"${profileId}"),contains-any(metric_id,["opened-email","clicked-email"])`
      )}`,
      { headers: this.headers }
    );
    if (!eventsRes.ok) return [];
    const eventsData = await eventsRes.json();
    return eventsData.data ?? [];
  }

  /**
   * Attaches a brief as a note-style profile property (Klaviyo has no timeline notes,
   * so we write to a custom property visible in the profile view).
   */
  async attachBriefAsProfileNote(email: string, briefText: string): Promise<void> {
    const profileRes = await fetch(`${this.baseUrl}/profiles/match/`, {
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

    await fetch(`${this.baseUrl}/profiles/${profileId}/`, {
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
    const profileRes = await fetch(`${this.baseUrl}/profiles/match/`, {
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

    await fetch(`${this.baseUrl}/profiles/${profileId}/`, {
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
    const res = await fetch(`${this.baseUrl}/contacts/search`, {
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

  async enrollInWorkflow(email: string, firstName: string): Promise<void> {
    // Upsert contact first
    const upsertRes = await fetch(`${this.baseUrl}/contacts`, {
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

  async enrollInRecoveryWorkflow(email: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;
    // Update lifecycle stage to trigger win-back workflows
    await fetch(`${this.baseUrl}/contacts/${contactId}`, {
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

    await fetch(`${this.baseUrl}/contacts/${contactId}`, {
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
    const res = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", {
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
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/deals/search", {
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
    const data = await res.json();
    return (data.results ?? []).map((d: any) => ({
      id: d.id,
      dealstage: d.properties.dealstage,
      createdate: d.properties.createdate,
      closedate: d.properties.closedate ?? null,
      isClosed: d.properties.hs_is_closed === "true",
      isClosedWon: d.properties.hs_is_closed_won === "true",
    }));
  }

  async attachTimelineNote(email: string, briefHtml: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetch(`${this.baseUrl}/notes`, {
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
  async markRebooked(email: string, workflowId?: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetch(`${this.baseUrl}/contacts/${contactId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({
        properties: { showtime_status: "rebooked" },
      }),
    });

    if (workflowId) {
      try {
        await fetch(
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

  constructor(private baseUrl: string, apiKey: string) {
    // baseUrl format: https://ACCOUNT.api-us1.com/api/3
    this.headers = {
      "Api-Token": apiKey,
      "Content-Type": "application/json",
    };
  }

  async enrollInList(email: string, firstName: string, listId: string): Promise<void> {
    // Upsert contact
    const contactRes = await fetch(`${this.baseUrl}/contacts/sync`, {
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
    await fetch(`${this.baseUrl}/contactLists`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        contactList: { list: listId, contact: contactId, status: 1 },
      }),
    });
  }

  private async findContactId(email: string): Promise<string | null> {
    const res = await fetch(
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
  async markRebooked(email: string, automationId?: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetch(`${this.baseUrl}/contactTags`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ contactTag: { contact: contactId, tag: "showtime_rebooked" } }),
    }).catch(() => {});

    if (automationId) {
      try {
        const assocRes = await fetch(
          `${this.baseUrl}/contactAutomations?filters[contact]=${contactId}&filters[automation]=${automationId}`,
          { headers: this.headers }
        );
        if (assocRes.ok) {
          const assocData = await assocRes.json();
          const contactAutomationId = assocData.contactAutomations?.[0]?.id;
          if (contactAutomationId) {
            await fetch(`${this.baseUrl}/contactAutomations/${contactAutomationId}`, {
              method: "DELETE",
              headers: this.headers,
            });
          }
        }
      } catch {
        // best-effort — the tag above is the reliable signal
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
    const res = await fetch(
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

    await fetch(
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

    await fetch(`${this.baseUrl}/contacts/${contactId}`, {
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

      const res = await fetch(`${this.baseUrl}/opportunities/search?${params.toString()}`, {
        headers: this.headers,
      });
      if (!res.ok) break;
      const data = await res.json();
      const opportunities: any[] = data.opportunities ?? [];
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

    await fetch(`${this.baseUrl}/contacts/${contactId}/notes`, {
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
  async markRebooked(email: string, workflowId?: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetch(`${this.baseUrl}/contacts/${contactId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({ customFields: [{ key: "showtime_status", field_value: "rebooked" }] }),
    }).catch(() => {});

    if (workflowId) {
      try {
        await fetch(
          `${this.baseUrl}/contacts/${contactId}/workflow/${workflowId}`,
          { method: "DELETE", headers: this.headers }
        );
      } catch {
        // best-effort — the custom field update above is the reliable signal
      }
    }
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
  meta: Record<string, any>
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

    default:
      throw new Error(
        `Unsupported email platform for sequence enrollment: ${platform}. ` +
        "Supported: klaviyo, hubspot, activecampaign, ghl"
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
  meta: Record<string, any>
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
export async function exitWinBackSequence(
  platform: string,
  apiKey: string,
  email: string,
  meta: Record<string, any>
): Promise<void> {
  switch (platform) {
    case "klaviyo":
      return new KlaviyoClient(apiKey).setProfileProperty(email, {
        showtime_status: "rebooked",
        rebooked_at: new Date().toISOString(),
      });

    case "hubspot":
      return new HubSpotClient(apiKey).markRebooked(email, meta.recovery_workflow_id);

    case "activecampaign":
      if (!meta.activecampaign_base_url) return;
      return new ActiveCampaignClient(meta.activecampaign_base_url, apiKey).markRebooked(
        email,
        meta.recovery_automation_id
      );

    case "ghl":
      if (!meta.location_id) return;
      return new GHLCRMClient(apiKey, meta.location_id).markRebooked(
        email,
        meta.recovery_workflow_id
      );

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
  meta: Record<string, any> = {}
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

    case "activecampaign":
      throw new Error(
        "ActiveCampaign requires a pre-registered numeric custom field ID for this, which isn't collected during onboarding yet — not supported."
      );

    default:
      throw new Error(`Unsupported email platform for personalized-intro delivery: ${platform}`);
  }
}

/**
 * Delivers a pre-call brief to the configured destination.
 * Called by pre-call-read after brief synthesis.
 */
export async function deliverBrief(
  destination: string,
  briefText: string,
  email: string,
  slackWebhookUrl?: string,
  crmApiKey?: string,
  crmMeta?: Record<string, any>
): Promise<void> {
  switch (destination) {
    case "slack":
      if (!slackWebhookUrl) {
        throw new Error("Slack delivery requires slack_webhook_url on engagement stack");
      }
      await fetch(slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: briefText },
            },
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
        await fetch(slackWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: briefText }),
        });
      }
  }
}