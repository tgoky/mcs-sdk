import { ReactNode, Suspense } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ShellLayout } from "@/components/shell-layout";
import { BreadcrumbProvider } from "@/components/breadcrumbs/breadcrumb-context";
import { BookingToast } from "./booking-toast";
import { WorkSidebar, WorkSidebarSkeleton } from "./work-sidebar";
import { EngagementsSidebar, EngagementsSidebarSkeleton } from "./engagements-sidebar";
import { AnalyticsSidebar } from "./analytics-sidebar";
import { StrategySidebar } from "./strategy-sidebar";
import { SkillsSidebar, SkillsSidebarSkeleton } from "./skills-sidebar";
import { MeetingsSidebar } from "./meetings-sidebar";

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

  return (
    <BreadcrumbProvider>
      {/* Real-time booking toast listener */}
      <BookingToast />

      {/* 3-Region Asana Layout Shell. Every section's sidebar is fetched
          here and handed down as its own Suspense-wrapped slot — only the
          one SecondarySidebar actually renders for the current route (see
          its own file comment), but keeping all six queries independent
          means switching sections never waits on a different section's
          DB round trip. Analytics/Strategy/Meetings have no DB-backed
          counts today so they don't need a Suspense/skeleton pair. */}
      <ShellLayout
        displayName={displayName}
        userEmail={userEmail}
        work={
          <Suspense fallback={<WorkSidebarSkeleton />}>
            <WorkSidebar whopUserId={whopUserId} />
          </Suspense>
        }
        engagements={
          <Suspense fallback={<EngagementsSidebarSkeleton />}>
            <EngagementsSidebar whopUserId={whopUserId} />
          </Suspense>
        }
        analytics={<AnalyticsSidebar />}
        strategy={<StrategySidebar />}
        skills={
          <Suspense fallback={<SkillsSidebarSkeleton />}>
            <SkillsSidebar whopUserId={whopUserId} />
          </Suspense>
        }
        meetings={<MeetingsSidebar />}
      >
        {children}
      </ShellLayout>
    </BreadcrumbProvider>
  );
}