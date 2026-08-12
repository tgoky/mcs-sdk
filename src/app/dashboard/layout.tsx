import { ReactNode, Suspense } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ShellLayout } from "@/components/shell-layout";
import { BreadcrumbProvider } from "@/components/breadcrumbs/breadcrumb-context";
import { BookingToast } from "./booking-toast";
import { WorkSidebar, WorkSidebarSkeleton } from "./work-sidebar";
import { EngagementsSidebar, EngagementsSidebarSkeleton } from "./engagements-sidebar";
import { AnalyticsSidebar } from "./analytics-sidebar";
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

      {/* 3-Region Asana Layout Shell. Every surviving section's sidebar is 
          fetched here and handed down as its own slot. Strategy and Skills 
          slots are removed per Observation 8. */}
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
        meetings={<MeetingsSidebar />}
      >
        {children}
      </ShellLayout>
    </BreadcrumbProvider>
  );
}