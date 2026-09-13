// src/app/dashboard/engagements/[id]/skills/whop-payout-hold-kit/page.tsx
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { PayoutHoldConsole } from "./payout-hold-console";

export const revalidate = 0;

/** Section 11.9 — Payout Hold Response Workspace. */
export default async function WhopPayoutHoldKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const activeWorkspace = await getActiveWorkspace(session?.whopUserId ?? "");

  const [engagement] = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session?.whopUserId ?? ""), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);

  if (!engagement) notFound();

  return (
    <div className="space-y-4 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · Payout Hold Kit`} />
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/engagements/${id}`}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
          aria-label="Back to engagement"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">Payout Hold Kit — {engagement.buyer}</h1>
      </div>
      <PayoutHoldConsole engagementId={id} />
    </div>
  );
}
