// src/app/dashboard/engagements/[id]/skills/pile-on/page.tsx
//
// The per-client, whole-history view for one skill — distinct from
// runs/[id] (one run) and the master roster calendar (all skills, one
// day). PileOnPipeline already existed fully built against a working API
// route (pile-on-pipeline/route.ts) but was never mounted anywhere in the
// app; this page is the thin server wrapper that makes it reachable.
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { PileOnPipeline } from "../../pile-on-pipeline";
import { PileOnAdCreativeBriefs } from "../../pile-on-ad-creative-briefs";

export const revalidate = 0;

export default async function PileOnSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  const [engagement] = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, adCreativeBriefs: engagements.adCreativeBriefs })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session?.whopUserId ?? "")))
    .limit(1);

  if (!engagement) notFound();

  return (
    <div className="space-y-4 font-sans antialiased">
      <SetBreadcrumbLabel label={`${engagement.buyer} · Pile-On`} />
      <BackLink href={`/dashboard/engagements/${id}`} label="Back to engagement" />

      <div>
        <h1 className="text-lg font-bold text-white">Pile-On — {engagement.buyer}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Every speed-to-lead sequence this engagement has ever run, not just today&apos;s calendar.
        </p>
      </div>

      <PileOnPipeline engagementId={id} />

      <PileOnAdCreativeBriefs pack={engagement.adCreativeBriefs} />
    </div>
  );
}
