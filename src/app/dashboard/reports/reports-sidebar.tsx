import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq, isNull, isNotNull, inArray, asc } from "drizzle-orm";
import { isProductId, type ProductId } from "@/lib/product-catalog";
import { getRepEnrolledEngagementIds } from "@/lib/rep-engagements";
import type { ReportableClient } from "./reports-client-links";

export { isProductId };
export type { ProductId };

// Shared with page.tsx, which needs the same list to resolve the selected
// client server-side — one query, not two independently-written copies of
// the same where-clause drifting apart later. bookingPlatform is pulled
// out of `stack` here (rather than page.tsx re-deriving it) so both the
// list and the per-client "which product's card" decision agree on the
// exact same signal productSetupState("showtime") uses on the engagement
// page.
//
// scopedProduct mirrors engagements/page.tsx's own `?product=` scoping —
// Reports is reached the same way Clients/Queue/Executions are (a link in
// the current product's own sidebar carrying `?product=`), so a client
// picked while inside Reputation Manager's context must never include a
// Showtime-only client and vice versa. No scopedProduct (the bare
// /dashboard/reports Work's sidebar links to) means the combined roster,
// same as Work's own "Clients" link.
export async function listReportableClients(
  whopUserId: string,
  workspaceId: string,
  scopedProduct: ProductId | null = null
): Promise<ReportableClient[]> {
  const baseFilter = and(
    eq(engagements.whopUserId, whopUserId),
    eq(engagements.workspaceId, workspaceId),
    isNull(engagements.deletedAt)
  );

  let rows;
  if (scopedProduct === "showtime") {
    rows = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
      .from(engagements)
      .where(and(baseFilter, isNotNull(engagements.stack)))
      .orderBy(asc(engagements.buyer));
  } else if (scopedProduct === "reputation-manager") {
    const repEngagementIds = await getRepEnrolledEngagementIds(whopUserId, workspaceId);
    rows = repEngagementIds.length
      ? await db
          .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
          .from(engagements)
          .where(and(baseFilter, inArray(engagements.engagementId, repEngagementIds)))
          .orderBy(asc(engagements.buyer))
      : [];
  } else {
    rows = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
      .from(engagements)
      .where(baseFilter)
      .orderBy(asc(engagements.buyer));
  }

  return rows.map((r) => ({
    engagementId: r.engagementId,
    buyer: r.buyer,
    bookingPlatform: (r.stack as { booking_platform?: string } | null)?.booking_platform ?? null,
  }));
}
