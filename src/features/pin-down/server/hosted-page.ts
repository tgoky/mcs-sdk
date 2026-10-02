// src/features/pin-down/server/hosted-page.ts
//
// What /confirm/[id] sends: the confirmation page Show Rate Setup built
// (stored as confirmationPageHtml), a plain placeholder until one exists,
// or a redirect when the client kept their own page.
//
// The page is served from the app's own domain, the same one the
// dashboard runs on, and part of it comes from the client's site. So it's
// served under a CSP sandbox: the document gets an opaque origin, which
// means a script in it can't read the dashboard's cookies or call its API
// as whoever is signed in. External scripts are refused outright; only
// the page's own inline personalization script runs.
import { buildMergeScriptTag, escapeHtml, mergeField, mergeSlot } from "./templates/content-model";

export const HOSTED_PAGE_CSP = [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https:",
  "font-src https: data:",
  "img-src https: data:",
  "media-src https:",
  "frame-src https:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function hostedPageHeaders(): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": HOSTED_PAGE_CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    // Booked prospects' names arrive in the address; never index it.
    "X-Robots-Tag": "noindex, nofollow",
    // Rebuilds show up on the next visit.
    "Cache-Control": "no-cache",
  };
}

/** Where to send a prospect when the client kept their own confirmation
 * page: that page, with the booking tool's details carried over. Only
 * http(s) addresses, and never back to a hosted page (a loop). */
export function existingPageRedirect(existingUrl: string, incomingSearch: string): URL | null {
  let target: URL;
  try {
    target = new URL(existingUrl.trim());
  } catch {
    return null;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  if (/^\/confirm\//.test(target.pathname)) return null;
  const incoming = new URLSearchParams(incomingSearch);
  incoming.forEach((value, key) => {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  });
  return target;
}

const PLACEHOLDER_CSS = `
:root { color-scheme: light dark; --bg:#f7f7f8; --card:#ffffff; --ink:#18181b; --muted:#6b6b76; --line:#e7e7ea; --accent:#16a34a; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e0e11; --card:#17171b; --ink:#f4f4f5; --muted:#a1a1aa; --line:#27272a; --accent:#22c55e; } }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px; background: var(--bg); color: var(--ink);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
main { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 32px 28px; text-align: center; }
.tick { width: 44px; height: 44px; margin: 0 auto 16px; border-radius: 999px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
h1 { margin: 0; font-size: 24px; line-height: 1.25; letter-spacing: -0.01em; }
.with { margin: 6px 0 0; color: var(--muted); font-size: 15px; }
.details { margin: 24px 0 0; padding-top: 20px; border-top: 1px solid var(--line); text-align: left; }
.details p { margin: 0 0 10px; }
.details p:last-child { margin-bottom: 0; color: var(--muted); font-size: 15px; }
strong { font-weight: 600; }
`;

/** A plain, honest confirmation shown until Show Rate Setup has built
 * this client's page. The prospect's name, host and call time come from
 * the booking tool's redirect and are filled in on the prospect's own
 * device, so the time shows in their timezone. */
export function buildPlaceholderConfirmationHtml(opts: { buyer: string | null; host: string | null }): string {
  const buyer = escapeHtml((opts.buyer ?? "").trim() || "us");
  const host = escapeHtml((opts.host ?? "").trim());
  const meetFallback = host ? `You'll meet with <strong>${host}</strong> at the time you picked.` : "We'll see you at the time you picked.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>You're booked with ${buyer}</title>
<style>${PLACEHOLDER_CSS}</style>
</head>
<body>
<main>
  <div class="tick" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
  <h1>${mergeField("firstName", "You're booked", `You're booked, ${mergeSlot("firstName")}`)}</h1>
  <p class="with">with ${buyer}</p>
  <div class="details">
    <p>${mergeField(
      "call_time",
      meetFallback,
      // The booking tool's host when it sends one (the script replaces the
      // text), otherwise the host this client set.
      `You'll meet with <strong><span data-merge="host">${host || "our team"}</span></strong> on <strong>${mergeSlot("call_time")}</strong>.`
    )}</p>
    <p>${mergeField("email", "A calendar invite with the call link is on its way to your inbox.", `A calendar invite with the call link is on its way to ${mergeSlot("email")}.`)}</p>
  </div>
</main>
${buildMergeScriptTag()}
</body>
</html>`;
}

export const NOT_FOUND_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Page not found</title>
<style>${PLACEHOLDER_CSS}</style></head>
<body><main><h1>This page isn't available</h1><p class="with">Check the link you were sent, or contact the business you booked with.</p></main></body></html>`;
