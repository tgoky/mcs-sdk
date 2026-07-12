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
