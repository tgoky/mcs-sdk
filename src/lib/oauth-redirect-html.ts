// Defect #4 fix (2026-08-08 handoff) — this was two near-identical copies
// of the same function (buildOutboundRedirectHtml in
// api/auth/login/route.ts, buildRedirectHtml in api/auth/callback/route.ts),
// differing only in their <p> message. Single source now.
//
// This intentionally stays outside the app's Tailwind/globals.css pipeline:
// it's a raw same-origin HTML document returned directly from a route
// handler mid-OAuth-redirect, not a React page, so it has no <link> to the
// app's stylesheet and can't reference CSS custom properties. #1f1a2e is
// kept as a literal for that reason — it approximates the app's dark-mode
// --card / --popover surface (see the color-mix formulas in globals.css)
// so this flash of a page doesn't look like an unstyled blank flicker
// between the previous page and the destination, but it can't be a design
// token here.
//
// Must never be a raw HTTP redirect (`Location: https://api.whop.com/...`):
// if this route is ever reached while the browser is mid-fetch on an
// RSC/client-side navigation (e.g. via middleware's 401→retry path, or the
// redundant server-side check in dashboard/layout.tsx), a raw cross-origin
// redirect forces a CORS preflight on the follow-on hop, and the fetch spec
// forbids a redirect response to a preflight request — that's the
// "Redirect is not allowed for a preflight request" crash. A 200
// same-origin HTML response that navigates via window.location instead is
// immune to this.
/** Only a path on this site: starts with one "/", no backslash (browsers
 * read "/\\host" as "//host"), no control characters, and still on this
 * origin once parsed. Anything else becomes the fallback. */
export function safeRelativePath(raw: string | null | undefined, fallback?: string): string | undefined {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const base = "https://app.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildOAuthRedirectHtml(destination: string, message: string): string {
  // The destination goes into an attribute and a script, so it's escaped
  // for each: HTML-escaped in the meta tag, and JSON with "<" escaped in
  // the script so "</script>" can't end it early.
  const inScript = JSON.stringify(destination).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}" />
  </head>
  <body style="background:#1f1a2e;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <p>${escapeHtml(message)}</p>
    <script>
      window.location.href = ${inScript};
    </script>
  </body>
</html>`;
}
