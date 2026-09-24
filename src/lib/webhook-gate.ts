// src/lib/webhook-gate.ts
//
// The token check for a webhook address a client's own tool calls, where
// the tool has no signature of its own set up (see lib/webhook-url-token.ts).
// Returns the response to send when the request can't go further, or null.

import { NextResponse } from "next/server";
import { afterResponse } from "@/lib/after-response";
import { checkWebhookToken } from "@/lib/webhook-url-token";
import { noticeLegacyWebhookAddress } from "@/lib/webhook-legacy-notice";

export function webhookTokenGate(engagementId: string, requestUrl: string, what: string): NextResponse | null {
  const check = checkWebhookToken(engagementId, requestUrl);
  if (check === "valid") return null;
  if (check === "rejected") {
    console.warn(`[webhook] Rejected ${what} call for ${engagementId}: missing or wrong address token.`);
    return NextResponse.json({ error: "This webhook address isn't valid. Copy the current one from the app." }, { status: 401 });
  }
  // An address given out before it carried a token: acknowledged so the
  // tool doesn't retry, not acted on, and the owner is told once.
  afterResponse(() => noticeLegacyWebhookAddress(engagementId, what));
  return NextResponse.json({ success: true, ignored: "This address needs updating. Copy the current one from Win-Back's settings." });
}
