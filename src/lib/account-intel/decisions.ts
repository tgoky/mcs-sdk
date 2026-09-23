// src/lib/account-intel/decisions.ts
//
// What the person decided on the review about the account reads: which
// event type is the sales call. Kept, or changed, it becomes theirs, and
// the booking config follows it.

import { confirmClientFact, editClientFact, getClientFact } from "@/lib/client-facts";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import type { EventTypeInfo } from "./analyze";

/** The config field a sales-call event type fills, per booking tool. */
export function salesCallMetaPatch(provider: string, id: string): Partial<NonNullable<EngagementStack["booking_platform_meta"]>> {
  if (provider === "calendly") return { event_type_uuid: id.split("/").pop() };
  if (provider === "cal_com") return { cal_event_type_id: id };
  if (provider === "ghl" || provider === "ghl_calendar") return { calendar_id: id };
  return {};
}

export async function recordSalesCallChoice(engagementId: string, eventTypeId: string): Promise<boolean> {
  const types = await getClientFact(engagementId, "bookingEventTypes");
  const { provider, types: list } = (types?.value ?? {}) as { provider?: string; types?: EventTypeInfo[] };
  const chosen = list?.find((t) => t.id === eventTypeId);
  if (!provider || !chosen) return false;

  const current = await getClientFact(engagementId, "salesCallEventType");
  if (current && current.status === "suggested" && (current.value as { id?: string })?.id === eventTypeId) {
    await confirmClientFact(engagementId, "salesCallEventType");
  } else {
    await editClientFact(engagementId, "salesCallEventType", { provider, id: chosen.id, name: chosen.name, url: chosen.url ?? null });
  }

  // A person's choice replaces whatever id was there.
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (row?.stack as Partial<EngagementStack> | null) ?? {};
  if (stack.booking_platform && stack.booking_platform !== provider && !(stack.booking_platform === "ghl_calendar" && provider === "ghl")) return true;
  await patchEngagementStack(engagementId, {
    booking_platform_meta: { ...(stack.booking_platform_meta ?? {}), ...salesCallMetaPatch(provider, chosen.id) },
    ...(!stack.booking_standing_link && chosen.url ? { booking_standing_link: chosen.url } : {}),
  });
  return true;
}
