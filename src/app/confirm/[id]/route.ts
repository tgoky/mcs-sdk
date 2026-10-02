// src/app/confirm/[id]/route.ts
//
// The hosted confirmation page: where a prospect lands after booking when
// the client's page isn't on their own site (Lovable, "any website",
// HighLevel until it's pasted, or a publish that didn't go through). It's
// the page Show Rate Setup built for this client, served as its own
// document (not inside the dashboard's layout), with the booking tool's
// details filled in on the prospect's device. See hosted-page.ts for the
// sandbox it's served under.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import {
  NOT_FOUND_HTML,
  buildPlaceholderConfirmationHtml,
  existingPageRedirect,
  hostedPageHeaders,
} from "@/features/pin-down/server/hosted-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGAGEMENT_ID = /^[A-Za-z0-9_-]{1,120}$/;

function page(html: string, status = 200): Response {
  return new Response(html, { status, headers: hostedPageHeaders() });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ENGAGEMENT_ID.test(id)) return page(NOT_FOUND_HTML, 404);

  const [row] = await db
    .select({
      buyer: engagements.buyer,
      prospectMeets: engagements.prospectMeets,
      stack: engagements.stack,
      confirmationPageHtml: engagements.confirmationPageHtml,
    })
    .from(engagements)
    .where(eq(engagements.engagementId, id))
    .limit(1);
  if (!row) return page(NOT_FOUND_HTML, 404);

  // The client kept their own page: send the prospect there, details and all.
  const stack = row.stack as EngagementStack | null;
  if (stack?.existing_confirmation_page_reuse && stack.existing_confirmation_page_url) {
    const target = existingPageRedirect(stack.existing_confirmation_page_url, new URL(request.url).search);
    if (target) return NextResponse.redirect(target, 307);
  }

  return page(row.confirmationPageHtml ?? buildPlaceholderConfirmationHtml({ buyer: row.buyer, host: row.prospectMeets }));
}
