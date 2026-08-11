// src/app/dashboard/engagements/[id]/skills/leak-map/page.tsx
//
// Same pattern as the Pile-On skill page. LeakMapSchedule already existed
// fully built — its own month/list views, audit history by severity,
// scheduled next-run dates, active alerts — against a working API route
// (leak-map-schedule/route.ts), but was never mounted anywhere in the app.
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { LeakMapSchedule } from "../../leak-map-schedule";

export const revalidate = 0;

export default async function LeakMapSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  const [engagement] = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session?.whopUserId ?? "")))
    .limit(1);

  if (!engagement) notFound();

  return (
    <div className="space-y-4 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · Leak-Map`} />
      <BackLink href={`/dashboard/engagements/${id}`} label="Back to engagement" />

      <div>
        <h1 className="text-lg font-bold text-white">Leak-Map — {engagement.buyer}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Every audit this engagement has ever run, not just today&apos;s calendar.
        </p>
      </div>

      <LeakMapSchedule engagementId={id} />
    </div>
  );
}
