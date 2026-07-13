/**
 * Ad-Data Platform Clients — Pile-On recovery gap 2.
 *
 * "Cohort" here means the set of people currently attributed to the
 * buyer's ad spend who are somewhere in the booking->call pipeline —
 * added on booking.created, removed on a terminal disposition
 * (cancelled/lost). This lets the buyer's ad platform (Meta/Google/
 * YouTube reporting layered on top of Hyros, or whatever their sheet
 * feeds) exclude people who already converted or dropped off from
 * ongoing retargeting spend.
 *
 * "native_crm" is intentionally the odd one out: it has no client class
 * here because it means "no separate ad-data platform — tag the
 * prospect on the email/CRM platform already connected," reusing
 * setCustomFields/setProfileProperty-style calls the email.ts clients
 * already expose, rather than introducing a fourth credential the buyer
 * has to manage. See cohort-sync.ts for how that path is wired.
 */

// ── Hyros ─────────────────────────────────────────────────────────────────

export class HyrosClient {
  private baseUrl = "https://api.hyros.com/v1/api/v1.0";
  private headers: HeadersInit;

  constructor(apiKey: string) {
    this.headers = { Authorization: apiKey, "Content-Type": "application/json" };
  }

  /**
   * Hyros doesn't have a first-class "cohort" object in its public API —
   * the closest durable primitive is tagging a lead with a named tag,
   * which Hyros's own reporting/segmentation UI can filter and exclude
   * on. `cohortId` here is used as that tag name.
   */
  async addToCohort(email: string, cohortId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/leads/update-lead-tags`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ email, tags: [cohortId], action: "add" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Hyros add-to-cohort failed [${res.status}]: ${body.slice(0, 300)}`);
    }
  }

  async removeFromCohort(email: string, cohortId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/leads/update-lead-tags`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ email, tags: [cohortId], action: "remove" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Hyros remove-from-cohort failed [${res.status}]: ${body.slice(0, 300)}`);
    }
  }

  async checkCredentialHealth(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/leads?limit=1`, { headers: this.headers });
    if (!res.ok) throw new Error(`Hyros credential check failed [${res.status}]`);
  }

  /**
   * Pre-Call Read recovery gap 4 — read-side of the cohort/ad-data
   * integration, used by brief-service.ts's Engagement History block.
   * Pulls whatever ad-touch history Hyros has attributed to this lead
   * (which ad/campaign brought them in, and any tracked prior touches)
   * so the brief can open with real context ("came in from the [X]
   * retargeting campaign") instead of nothing. Best-effort — a lead with
   * no ad attribution on file (e.g. organic/referral) is a completely
   * normal, non-error outcome, not a failure.
   */
  async getLeadAdContext(email: string): Promise<{ found: boolean; sourceAd?: string; firstTouchAt?: string; touchCount?: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/leads?email=${encodeURIComponent(email)}`, { headers: this.headers });
      if (!res.ok) return { found: false };
      const data = await res.json();
      const lead = data.result?.[0] ?? data.data?.[0];
      if (!lead) return { found: false };
      return {
        found: true,
        sourceAd: lead.firstSource?.adName ?? lead.first_source?.ad_name ?? undefined,
        firstTouchAt: lead.firstConversionDate ?? lead.first_conversion_date ?? undefined,
        touchCount: Array.isArray(lead.conversions) ? lead.conversions.length : undefined,
      };
    } catch {
      return { found: false };
    }
  }
}

// ── Google Sheets ────────────────────────────────────────────────────────

/**
 * The "good starter adapter to prove the pattern" per the transfer
 * analysis — no cohort concept to model, just an append-only sheet the
 * buyer's own ad reporting (or a Zapier/Sheets-fed audience sync) reads
 * from. Auth is a plain OAuth2 access token (short-lived) or, more
 * realistically for a buyer who isn't setting up an OAuth flow, a
 * service-account access token minted elsewhere and passed in as apiKey
 * — this client doesn't handle token refresh itself, matching this
 * codebase's existing pattern of resolveCredential() returning a
 * ready-to-use token rather than owning a refresh flow (see hosting.ts's
 * Vercel client for the same assumption).
 */
export class GoogleSheetsCohortClient {
  private baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
  private headers: HeadersInit;

  constructor(accessToken: string, private spreadsheetId: string, private sheetName: string) {
    this.headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  }

  async addToCohort(email: string, cohortId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(this.sheetName)}:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          values: [[email, cohortId, "added", new Date().toISOString()]],
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Sheets append failed [${res.status}]: ${body.slice(0, 300)}`);
    }
  }

  /**
   * Sheets has no row-delete-by-value primitive cheap enough to call per
   * prospect (would require a read-then-batchUpdate round trip against
   * row indices that can shift under concurrent appends). Instead this
   * appends a second "removed" row with the same email/cohort — the
   * buyer's downstream consumer (Zapier filter, Sheets formula, whatever
   * reads this sheet) treats the latest row per email as the current
   * status. Documented here rather than silently doing something more
   * fragile.
   */
  async removeFromCohort(email: string, cohortId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(this.sheetName)}:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          values: [[email, cohortId, "removed", new Date().toISOString()]],
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Sheets append (removal) failed [${res.status}]: ${body.slice(0, 300)}`);
    }
  }
}

// ── Router ────────────────────────────────────────────────────────────────

export interface AdDataTenantMeta {
  hyros_account_id?: string;
  google_sheets_spreadsheet_id?: string;
  google_sheets_cohort_sheet_name?: string;
}

export async function addToAdDataCohort(
  adDataPlatform: string,
  apiKey: string,
  meta: AdDataTenantMeta | undefined,
  cohortId: string,
  email: string
): Promise<void> {
  switch (adDataPlatform) {
    case "hyros":
      return new HyrosClient(apiKey).addToCohort(email, cohortId);
    case "google_sheets":
      if (!meta?.google_sheets_spreadsheet_id || !meta?.google_sheets_cohort_sheet_name) {
        throw new Error("Google Sheets ad-data platform requires google_sheets_spreadsheet_id and google_sheets_cohort_sheet_name in ad_data_platform_meta");
      }
      return new GoogleSheetsCohortClient(apiKey, meta.google_sheets_spreadsheet_id, meta.google_sheets_cohort_sheet_name).addToCohort(email, cohortId);
    default:
      throw new Error(`addToAdDataCohort does not support platform "${adDataPlatform}" — use the native_crm path via email.ts for that case instead.`);
  }
}

export async function removeFromAdDataCohort(
  adDataPlatform: string,
  apiKey: string,
  meta: AdDataTenantMeta | undefined,
  cohortId: string,
  email: string
): Promise<void> {
  switch (adDataPlatform) {
    case "hyros":
      return new HyrosClient(apiKey).removeFromCohort(email, cohortId);
    case "google_sheets":
      if (!meta?.google_sheets_spreadsheet_id || !meta?.google_sheets_cohort_sheet_name) {
        throw new Error("Google Sheets ad-data platform requires google_sheets_spreadsheet_id and google_sheets_cohort_sheet_name in ad_data_platform_meta");
      }
      return new GoogleSheetsCohortClient(apiKey, meta.google_sheets_spreadsheet_id, meta.google_sheets_cohort_sheet_name).removeFromCohort(email, cohortId);
    default:
      throw new Error(`removeFromAdDataCohort does not support platform "${adDataPlatform}" — use the native_crm path via email.ts for that case instead.`);
  }
}

/**
 * Pre-Call Read recovery gap 4 — read-side lookup for the brief's
 * Engagement History block. Only Hyros exposes anything readable here;
 * Google Sheets is a write-only append log by design (see
 * GoogleSheetsCohortClient's module comment) and native_crm's ad context
 * is just whatever tag was set, which brief-service.ts can read directly
 * off the buyer's CRM profile without this adapter.
 */
export async function getAdDataContextForTenant(
  adDataPlatform: string,
  apiKey: string,
  email: string
): Promise<{ found: boolean; sourceAd?: string; firstTouchAt?: string; touchCount?: number }> {
  switch (adDataPlatform) {
    case "hyros":
      return new HyrosClient(apiKey).getLeadAdContext(email);
    default:
      return { found: false };
  }
}
