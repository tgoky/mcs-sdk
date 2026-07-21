// src/app/api/auth/login/route.ts
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";
import { encryptOAuthState } from "@/lib/oauth-state";

// Same reasoning as buildRedirectHtml in the callback route: this must never
// be a raw HTTP redirect (`Location: https://api.whop.com/...`). If this
// route is ever reached while the browser is mid-fetch on an RSC/client-side
// navigation (e.g. via middleware's 401→retry path, or the redundant
// server-side check in dashboard/layout.tsx), a raw cross-origin redirect
// forces a CORS preflight on the follow-on hop, and the fetch spec forbids a
// redirect response to a preflight request — that's the
// "Redirect is not allowed for a preflight request" crash. A 200 same-origin
// HTML response that navigates via window.location instead is immune to
// this, and it's exactly the same trick already used on the way back in
// api/auth/callback/route.ts.
function buildOutboundRedirectHtml(destination: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0;url=${destination}" />
  </head>
  <body style="background:#1f1a2e;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <p>Redirecting to Whop...</p>
    <script>
      window.location.href = ${JSON.stringify(destination)};
    </script>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("base64url");

  const rawRedirectTo = new URL(request.url).searchParams.get("redirect_to");
  const safeRedirectTo =
    rawRedirectTo && rawRedirectTo.startsWith("/") && !rawRedirectTo.startsWith("//")
      ? rawRedirectTo
      : undefined;

  // 🔑 THE FIX: Encrypt code_verifier INTO the state parameter.
  // This survives the cross-site round-trip to Whop and back,
  // unlike cookies which get blocked in iframe contexts.
  const state = encryptOAuthState(
    { codeVerifier, redirectTo: safeRedirectTo },
    process.env.SESSION_SECRET!
  );

  const destination = generateAuthUrl(state, codeVerifier, nonce);

  return new Response(buildOutboundRedirectHtml(destination), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}