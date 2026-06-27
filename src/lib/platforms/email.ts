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
}

// ── HubSpot ───────────────────────────────────────────────────────────────

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

  async attachCRMNote(email: string, noteText: string): Promise<void> {
    const contactId = await this.findContactId(email);
    if (!contactId) return;

    await fetch(`${this.baseUrl}/contacts/${contactId}/notes`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ body: noteText }),
    });
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