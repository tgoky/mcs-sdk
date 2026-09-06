// src/lib/create-minimal-engagement.ts
//
// A client created with just a name — nothing else. Same minimal insert
// shape src/app/api/reputation-manager/new/route.ts already established
// for its own "new client" entry point, generalized here for Teammates
// chat's create_client tool rather than duplicated.
//
// Deliberately does NOT try to be a chat replica of the full
// /dashboard/engagements/new wizard (offer details, top call questions,
// objections, credentials, hosting, testimonials, booking/email platform
// — none of that is asked here). Same "additive, not a replacement" rule
// this project settled on for chat-driven onboarding generally: this gets
// a real, launchable-once-configured row into existence fast, full setup
// still happens on the engagement's own page afterward, same as it would
// for a client someone half-filled out in the wizard and came back to
// later. launchedAt stays null exactly the way the wizard's own post-save
// (pre-launch) state already works — this isn't a new lifecycle state,
// it's the same one.
//
// stack is deliberately left unset, not partially set — EngagementStack
// requires booking_platform_credentials_ref (and its email counterpart),
// so a stack built from just a platform choice with no credential
// wouldn't actually satisfy the type, and a half-valid stack would be a
// more confusing state on the engagement's own page afterward than no
// stack at all. Same reasoning the reputation-manager precedent already
// applied — its own minimal insert leaves stack out entirely too.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { generateEngagementId } from "@/lib/engagement-id";
import crypto from "crypto";

export async function createMinimalEngagement(opts: {
  whopUserId: string;
  workspaceId: string;
  buyerName: string;
}): Promise<{ engagementId: string }> {
  const buyerName = opts.buyerName.trim();
  const engagementId = generateEngagementId(buyerName);

  await db.insert(engagements).values({
    id: crypto.randomUUID(),
    engagementId,
    whopUserId: opts.whopUserId,
    workspaceId: opts.workspaceId,
    buyer: buyerName,
  });

  return { engagementId };
}