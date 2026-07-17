/**
 * Hosting Platform Adapters
 *
 * Pin-Down's confirmation page deploys onto the BUYER's own hosting stack,
 * never ours — this is the OG skill's principle #1 ("buyer assets always
 * live in the buyer's stack, never ours"), and the product decision is to
 * match that promise rather than centrally host every buyer's confirmation
 * page under our own domain.
 *
 * Three platforms have a real, documented publish path we can drive
 * end-to-end from the buyer's own API credentials:
 *   - Webflow (CMS Collection Item + optional custom-code embed)
 *   - WordPress (REST API page/post with Gutenberg block content)
 *   - Vercel (Deployments API, inline files, buyer's own project/team)
 *
 * GHL, Lovable, and plain HTML do not have a reliable, buyer-credentialed
 * API path for pushing a full page (GHL's funnel/page builder API is not a
 * stable public surface at the time this was written; Lovable has no
 * public API at all; "plain HTML" by definition has no platform to call).
 * For those, we don't fake an integration — we generate the same page
 * content as a self-contained HTML file plus platform-specific paste-ready
 * instructions, exactly the failure-mode behavior the OG SKILL.md
 * specifies for "hosting platform deploy fails" and for platforms outside
 * the supported set. This is not a shortcut; it's the documented design.
 */


import { fetchWithTimeout } from "@/lib/http";
export interface ConfirmationPageContent {
  /** Full self-contained HTML document — used as-is for plain_html, and as
   * the source Webflow/WordPress adapters extract a body/content payload from. */
  html: string;
  title: string;
}

export type HostingDeployResult =
  | { mode: "live"; url: string; deployedVia: string; resourceId?: string | number } // 🌟 THE FIX: Clean typed data passing
  | {
      mode: "paste_ready";
      reason: string;
      instructions: string;
      html: string;
    };

// ── Webflow ──────────────────────────────────────────────────────────────

export class WebflowClient {
  private baseUrl = "https://api.webflow.com/v2";
  private headers: HeadersInit;

  constructor(siteApiToken: string) {
    this.headers = {
      Authorization: `Bearer ${siteApiToken}`,
      "Content-Type": "application/json",
      "accept-version": "2.0.0",
    };
  }

  /**
   * Publishes the confirmation page as a CMS Collection Item. This is the
   * realistic API-driven path on Webflow: the buyer sets up a "Confirmation
   * Pages" collection (or Pin-Down documents the field mapping for them to
   * create one) with a template bound to a static-content field, and each
   * engagement gets its own item/slug — e.g.
   * https://buyer-domain.com/confirmation/{engagementId}. Webflow does not
   * expose a general "create arbitrary full-layout static page" endpoint,
   * so CMS-item-as-page is the correct mechanism, not a workaround.
   */
  async publishConfirmationItem(
    collectionId: string,
    slug: string,
    content: ConfirmationPageContent
  ): Promise<{ itemId: string }> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/collections/${collectionId}/items`,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          isArchived: false,
          isDraft: false,
          fieldData: {
            name: content.title,
            slug,
            // Buyer's CMS template is expected to bind this field to a
            // rich-text / embed element. Field name is a convention Pin-Down
            // documents to the buyer during hosting setup, not a Webflow
            // built-in.
            "confirmation-page-html": content.html,
          },
        }),
      }
    );
    if (!res.ok) {
      throw new Error(
        `Webflow CMS item creation failed [${res.status}]: ${await res.text()}`
      );
    }
    const data = await res.json();
    return { itemId: data.id };
  }

  /** Publishes the site so the new/updated item goes live at its public URL. */
  async publishSite(siteId: string): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/sites/${siteId}/publish`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ publishToWebflowSubdomain: false }),
    });
    if (!res.ok) {
      throw new Error(`Webflow site publish failed [${res.status}]: ${await res.text()}`);
    }
  }

  /**
   * Injects a small tracking/embed script at the page level. Used
   * alongside (not instead of) the CMS item path when the buyer wants
   * booking-widget or analytics script on the confirmation page. Webflow's
   * page-level custom code endpoint accepts head/body script blocks, not
   * full HTML — it is not a mechanism for shipping the page body itself.
   */
  async injectPageScript(
    pageId: string,
    script: { location: "header" | "footer"; source: string }
  ): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/pages/${pageId}/custom_code`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({
        scripts: [{ location: script.location, source: script.source }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Webflow custom code injection failed [${res.status}]: ${await res.text()}`);
    }
  }
}

// ── WordPress ────────────────────────────────────────────────────────────

export class WordPressClient {
  private baseUrl: string;
  private headers: HeadersInit;

  /**
   * siteUrl: the buyer's own WordPress base URL, e.g. https://buyer.com
   * appPassword: a WordPress Application Password the buyer generates
   * themselves under Users -> Profile -> Application Passwords. Format
   * expected here is "username:app_password" (already colon-joined).
   */
  constructor(siteUrl: string, usernameColonAppPassword: string) {
    this.baseUrl = `${siteUrl.replace(/\/$/, "")}/wp-json/wp/v2`;
    this.headers = {
      Authorization: `Basic ${Buffer.from(usernameColonAppPassword).toString("base64")}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Creates (or updates, if pageId is supplied) a Page with Gutenberg
   * block-comment markup as content. WordPress's block editor stores
   * content as HTML annotated with `<!-- wp:block-name -->` comment
   * delimiters — the REST API accepts raw block markup directly in
   * `content`, no plugin required for a plain HTML/Group block.
   */
  async publishPage(
    content: ConfirmationPageContent,
    slug: string,
    pageId?: number
  ): Promise<{ pageId: number; link: string }> {
    const blockContent = `<!-- wp:html -->\n${content.html}\n<!-- /wp:html -->`;

    const body = {
      title: content.title,
      slug,
      status: "publish",
      content: blockContent,
    };

    const res = await fetchWithTimeout(
      pageId ? `${this.baseUrl}/pages/${pageId}` : `${this.baseUrl}/pages`,
      {
        method: "POST", // WP REST API uses POST for both create and update-by-id
        headers: this.headers,
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      throw new Error(`WordPress page publish failed [${res.status}]: ${await res.text()}`);
    }
    const data = await res.json();
    return { pageId: data.id, link: data.link };
  }
}

// ── Vercel ───────────────────────────────────────────────────────────────

export class VercelClient {
  private baseUrl = "https://api.vercel.com";
  private headers: HeadersInit;

  /** token: the buyer's own Vercel Personal/Team Access Token. */
  constructor(private token: string, private teamId?: string) {
    this.headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Creates a deployment on the buyer's own Vercel account/project from a
   * single inline static HTML file. Real, documented endpoint (Deployments
   * API v13) — no template repo or build step required for a static file
   * deployment, which is all a confirmation page needs.
   */
  async deployStaticPage(
    projectName: string,
    content: ConfirmationPageContent
  ): Promise<{ url: string; deploymentId: string }> {
    const qs = this.teamId ? `?teamId=${this.teamId}` : "";
    const res = await fetchWithTimeout(`${this.baseUrl}/v13/deployments${qs}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        name: projectName,
        target: "production",
        files: [
          {
            file: "index.html",
            data: content.html,
          },
        ],
        projectSettings: { framework: null },
      }),
    });
    if (!res.ok) {
      throw new Error(`Vercel deployment failed [${res.status}]: ${await res.text()}`);
    }
    const data = await res.json();
    return { url: `https://${data.url}`, deploymentId: data.id };
  }
}

// ── Router ───────────────────────────────────────────────────────────────

export interface HostingMeta {
  // Webflow
  webflow_site_id?: string;
  webflow_collection_id?: string;
  webflow_page_id?: string; // for optional script injection
  // WordPress
  wordpress_site_url?: string;
  wordpress_page_id?: number;
  // Vercel
  vercel_project_name?: string;
  vercel_team_id?: string;
}

/**
 * Publishes the confirmation page for a tenant using their hosting stack.
 * Returns either a live buyer-hosted URL, or a paste-ready fallback per the
 * OG SKILL.md failure-mode policy ("hosting platform deploy fails: hand
 * back the page as a self-contained HTML file with deployment instructions
 * tailored to the detected platform").
 */
export async function publishConfirmationPage(
  hostingPlatform: string,
  apiKey: string | null,
  meta: HostingMeta | undefined,
  content: ConfirmationPageContent,
  slug: string
): Promise<HostingDeployResult> {
  try {
    switch (hostingPlatform) {
      case "webflow": {
        if (!apiKey || !meta?.webflow_site_id || !meta?.webflow_collection_id) {
          return pasteReady(
            "webflow",
            "Missing Webflow site/collection configuration.",
            content
          );
        }
        const client = new WebflowClient(apiKey);
        const { itemId } = await client.publishConfirmationItem(
          meta.webflow_collection_id,
          slug,
          content
        );
        await client.publishSite(meta.webflow_site_id);
        return {
          mode: "live",
          url: `https://${meta.webflow_site_id}.webflow.io/confirmation/${slug}`,
          deployedVia: `webflow:${itemId}`,
        };
      }

     case "wordpress": {
        if (!apiKey || !meta?.wordpress_site_url) {
          return pasteReady(
            "wordpress",
            "Missing WordPress site URL or Application Password.",
            content
          );
        }
        const client = new WordPressClient(meta.wordpress_site_url, apiKey);
        // 🌟 THE FIX: Destructure both the unique pageId AND link URL from WordPress response
        const { pageId, link } = await client.publishPage(content, slug, meta.wordpress_page_id);
        return { 
          mode: "live", 
          url: link, 
          deployedVia: "wordpress", 
          resourceId: pageId // 🌟 THE FIX: Bubble the ID up cleanly out of the client adapter
        };
      }
      

      case "nextjs_vercel": {
        if (!apiKey) {
          return pasteReady("nextjs_vercel", "Missing Vercel access token.", content);
        }
        const client = new VercelClient(apiKey, meta?.vercel_team_id);
        const { url } = await client.deployStaticPage(
          meta?.vercel_project_name ?? `confirmation-${slug}`,
          content
        );
        return { mode: "live", url, deployedVia: "vercel" };
      }

      case "ghl":
        // GHL's funnel/page builder does not expose a stable public API for
        // programmatic page creation. Rather than build against an
        // undocumented surface that breaks silently, this ships as
        // paste-ready per the OG SKILL.md unsupported-platform handler.
        return pasteReady(
          "ghl",
          "GHL funnel page creation has no stable public API — paste this into a new Funnel/Website page.",
          content
        );

      case "lovable":
        return pasteReady(
          "lovable",
          "Lovable has no public API for programmatic page publishing.",
          content
        );

      case "plain_html":
        return pasteReady(
          "plain_html",
          "Plain HTML hosting has no platform to call — the buyer deploys this file to their own host.",
          content
        );

      default:
        return pasteReady(hostingPlatform, `Unrecognized hosting platform: ${hostingPlatform}.`, content);
    }
  } catch (e: any) {
    // Deploy attempted and failed (auth error, build error, rate limit) —
    // same fallback contract as an unsupported platform, per OG SKILL.md
    // "Hosting platform deploy fails" failure mode.
    return pasteReady(hostingPlatform, e.message, content);
  }
}

function pasteReady(
  platform: string,
  reason: string,
  content: ConfirmationPageContent
): HostingDeployResult {
  const instructionsByPlatform: Record<string, string> = {
    webflow:
      "In Webflow Designer: create a page (or CMS collection item) at the confirmation slug, add an Embed element, and paste the HTML below into it. Publish the site.",
    wordpress:
      "In WordPress admin: create a new Page, switch to the Code Editor (or add a Custom HTML block), paste the HTML below, and publish.",
    nextjs_vercel:
      "Add the HTML below as a static file (e.g. public/confirmation.html) in the buyer's repo and deploy via their normal Git push flow.",
    ghl: "In GoHighLevel: open Funnels/Websites, add a new page, switch to Custom Code / HTML element, and paste the HTML below.",
    lovable:
      "In the Lovable project chat, ask Lovable to create a new page at the confirmation route using the HTML/content below as the source of truth.",
    plain_html:
      "Upload the HTML file below to the buyer's own static host (S3, Cloudflare Pages, FTP, etc.) at the confirmation path.",
  };

  return {
    mode: "paste_ready",
    reason,
    instructions:
      instructionsByPlatform[platform] ??
      "Paste the HTML below into the buyer's hosting platform at the confirmation page path.",
    html: content.html,
  };
}
