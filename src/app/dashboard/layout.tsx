import { ReactNode, Suspense } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ShellLayout } from "@/components/shell-layout";
import { BreadcrumbProvider } from "@/components/breadcrumbs/breadcrumb-context";
import { BookingToast } from "./booking-toast";
import { SidebarNav, SidebarNavSkeleton } from "./sidebar-nav";
import { SidebarSkills, SidebarSkillsSkeleton } from "./sidebar-skills";

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

      {/* 3-Region Asana Layout Shell */}
      <ShellLayout
        displayName={displayName}
        userEmail={userEmail}
        sidebarNav={
          <Suspense fallback={<SidebarNavSkeleton />}>
            <SidebarNav whopUserId={whopUserId} />
          </Suspense>
        }
        sidebarSkills={
          <Suspense fallback={<SidebarSkillsSkeleton />}>
            <SidebarSkills whopUserId={whopUserId} />
          </Suspense>
        }
      >
        {children}
      </ShellLayout>
    </BreadcrumbProvider>
  );
}