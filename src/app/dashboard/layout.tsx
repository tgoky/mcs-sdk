import { ReactNode, Suspense } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ShellLayout } from "@/components/shell-layout";
import { BreadcrumbProvider } from "@/components/breadcrumbs/breadcrumb-context";
import { BookingToast } from "./booking-toast";
import { WorkSidebar, WorkSidebarSkeleton } from "./work-sidebar";
import { EngagementsSidebar, EngagementsSidebarSkeleton } from "./engagements-sidebar";
import { MeetingsSidebar } from "./meetings-sidebar";
import { getActiveWorkspace, listWorkspaces } from "@/lib/workspace";
import { MobileNavPill } from "@/components/mobile-nav-pill";

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
  const [activeWorkspace, workspaceList] = await Promise.all([
    getActiveWorkspace(whopUserId),
    listWorkspaces(whopUserId),
  ]);

  return (
    <BreadcrumbProvider>
      {/* Real-time booking toast listener */}
      <BookingToast />

      {/* 3-Region Asana Layout Shell. Every section's sidebar is fetched
          here and handed down as its own Suspense-wrapped slot — only the
          one SecondarySidebar actually renders for the current route (see
          its own file comment), but keeping all four queries independent
          means switching sections never waits on a different section's
          DB round trip. Strategy and Skills used
          to be here too; Strategy's primary-rail entry was already
          commented out (dead), and Skills' SKILL STATUS panel was
          deleted per the 2026-08-07 handoff's Observation 8 — see
          secondary-sidebar.tsx's file comment. */}
      <ShellLayout
        displayName={displayName}
        userEmail={userEmail}
        workspaces={workspaceList}
        activeWorkspaceId={activeWorkspace.workspaceId}
        work={
          <Suspense fallback={<WorkSidebarSkeleton />}>
            <WorkSidebar whopUserId={whopUserId} workspaceId={activeWorkspace.workspaceId} />
          </Suspense>
        }
        engagements={
          <Suspense fallback={<EngagementsSidebarSkeleton />}>
            <EngagementsSidebar whopUserId={whopUserId} workspaceId={activeWorkspace.workspaceId} />
          </Suspense>
        }
        meetings={<MeetingsSidebar />}
      >
        {children}
      </ShellLayout>

      {/* Floating Mobile Nav Pill & Accordion Navigation */}
      <MobileNavPill />
    </BreadcrumbProvider>
  );
}