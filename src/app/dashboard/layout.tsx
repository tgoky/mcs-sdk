import { ReactNode, Suspense } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ShellLayout } from "@/components/shell-layout";
import { BreadcrumbProvider } from "@/components/breadcrumbs/breadcrumb-context";
import { BookingToast } from "./booking-toast";
import { WorkSidebar, WorkSidebarSkeleton } from "./work-sidebar";
import { getActiveWorkspace, listWorkspaces, getPrimaryEngagementIdForWorkspace } from "@/lib/workspace";
import { getUserAvatar } from "@/lib/user-avatar";
import { MobileNavPill } from "@/components/mobile-nav-pill";
import { TourProvider } from "@/components/tours/tour-provider";
import { TourOverlay } from "@/components/tours/tour-overlay";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();

  // 1. Auth Guard
  if (!session.whopUserId) {
    redirect("/api/auth/login");
  }

  const whopUserId = session.whopUserId;
  const userEmail = session.email || "user@showtime.app";
  const displayName = session.email?.split("@")[0] ?? "Member";

  // Resolves (and, for a brand-new-to-workspaces account, self-heals) the
  // active workspace for every request under /dashboard — including a
  // direct/bookmarked hit that skipped /home entirely, so there's no route
  // under here that can render without one. getActiveWorkspace is
  // React-cache()'d, so WorkSidebar/EngagementsSidebar/page.tsx resolving
  // it again below this in the tree reuse this same lookup instead of
  // re-querying.
  const [activeWorkspace, workspaceList, avatar] = await Promise.all([
    getActiveWorkspace(whopUserId),
    listWorkspaces(whopUserId),
    getUserAvatar(whopUserId),
  ]);

  // Interactive tours (src/lib/tours) are scoped to this workspace's
  // primary engagement — same convention the Library and WorkersPanel
  // already use for anything product-related that isn't tied to a
  // specific engagement page in the URL. Mounted here, above `{children}`,
  // so the provider survives every route change under /dashboard instead
  // of resetting mid-tour on each navigation.
  const primaryEngagementId = await getPrimaryEngagementIdForWorkspace(activeWorkspace.workspaceId);
  const tourStack = primaryEngagementId
    ? await db
        .select({ stack: engagements.stack })
        .from(engagements)
        .where(eq(engagements.engagementId, primaryEngagementId))
        .limit(1)
        .then((r) => (r[0]?.stack as EngagementStack | null) ?? null)
    : null;

  return (
    <BreadcrumbProvider>
      <TourProvider engagementId={primaryEngagementId} initialProgress={tourStack?.tour_state ?? {}}>
        {/* Real-time booking toast listener */}
        <BookingToast />

        {/* 3-Region Asana Layout Shell. One Work sidebar, generic across
            every worker in the unified registry regardless of product (its
            own Capabilities grid already spans both) — this used to also
            carry a separate ShowtimeSidebar/ReputationManagerSidebar pair
            plus two more Reports variants with their own client pickers,
            the same "different menu depending on product context" problem
            the worker-registry restructure exists to remove, still standing
            here through every phase of it until now. */}
        <ShellLayout
          displayName={displayName}
          userEmail={userEmail}
          workspaces={workspaceList}
          activeWorkspaceId={activeWorkspace.workspaceId}
          avatar={avatar}
          work={
            <Suspense fallback={<WorkSidebarSkeleton />}>
              <WorkSidebar whopUserId={whopUserId} workspaceId={activeWorkspace.workspaceId} />
            </Suspense>
          }
        >
          {children}
        </ShellLayout>

        {/* Floating Mobile Nav Pill & Accordion Navigation */}
        <MobileNavPill />

        <TourOverlay />
      </TourProvider>
    </BreadcrumbProvider>
  );
}
