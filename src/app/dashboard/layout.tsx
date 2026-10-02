import { ReactNode, Suspense } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ShellLayout } from "@/components/shell-layout";
import { BreadcrumbProvider } from "@/components/breadcrumbs/breadcrumb-context";
import { BookingToast } from "./booking-toast";
import { WorkSidebar, WorkSidebarSkeleton } from "./work-sidebar";
import { getActiveWorkspace, listWorkspaces, getPrimaryEngagementIdForWorkspace, getInstalledPackagesByWorkspace } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { PRODUCT_ONBOARDING_WORKER_ID, WORKER_REGISTRY } from "@/lib/worker-registry";
import { isProductId } from "@/lib/product-catalog";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";
import { hasSkillSettings } from "@/lib/skill-settings/schema";
import type { CreateMenuContext } from "@/components/top-nav";
import { getUserAvatar } from "@/lib/user-avatar";
import { MobileNavPill } from "@/components/mobile-nav-pill";
import { TourProvider } from "@/components/tours/tour-provider";
import { TourOverlay } from "@/components/tours/tour-overlay";
import { ToastProvider } from "@/components/toast/toast-provider";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, type EngagementStack } from "@/models/schema";
import { and, eq, sql } from "drizzle-orm";

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
  const primaryRow = primaryEngagementId
    ? await db
        .select({ stack: engagements.stack, pausedAt: engagements.pausedAt })
        .from(engagements)
        .where(eq(engagements.engagementId, primaryEngagementId))
        .limit(1)
        .then((r) => r[0] ?? null)
    : null;
  const tourStack = (primaryRow?.stack as EngagementStack | null | undefined) ?? null;
  // What the Create menu's shortcuts act on: this client's switched-on
  // skills and installed products. A failed read leaves the lists empty,
  // never the whole dashboard down.
  const [enabledIds, installed] = await Promise.all([
    primaryEngagementId ? getEnabledWorkerIdsForEngagement(primaryEngagementId).catch(() => []) : Promise.resolve([]),
    getInstalledPackagesByWorkspace([activeWorkspace.workspaceId]).catch(() => new Map<string, string[]>()),
  ]);
  // "Grow your reputation" needs Reputation Manager installed and its
  // Identity Setup run for this client (the same rule as the client page's
  // card). A failed read just leaves the shortcut out.
  const canGrowReputation =
    primaryEngagementId && (installed.get(activeWorkspace.workspaceId) ?? []).includes("reputation-manager")
      ? await db
          .select({ id: repIdentityGraphs.id })
          .from(repIdentityGraphs)
          .where(eq(repIdentityGraphs.engagementId, primaryEngagementId))
          .limit(1)
          .then((r) => r.length > 0)
          .catch(() => false)
      : false;
  const createMenu: CreateMenuContext = {
    engagementId: primaryEngagementId,
    canGrowReputation,
    paused: Boolean(primaryRow?.pausedAt),
    skills: enabledIds.map((id) => ({ id, name: WORKER_REGISTRY[id].name, hasSettings: hasSkillSettings(id) })),
    products: (installed.get(activeWorkspace.workspaceId) ?? []).filter(isProductId).map((id) => ({
      id,
      name: WORKSPACE_PRODUCTS.find((p) => p.id === id)?.name ?? id,
      setupSkillId: PRODUCT_ONBOARDING_WORKER_ID[id],
    })),
  };

  // The first-visit welcome is per operator, not per client: once they've
  // dismissed it or taken any tour in any of their workspaces, a new
  // workspace doesn't greet them again.
  const [seenTours] = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), sql`${engagements.stack} -> 'tour_state' <> '{}'::jsonb`))
    .limit(1);

  return (
    <BreadcrumbProvider>
      <ToastProvider>
        <TourProvider engagementId={primaryEngagementId} initialProgress={tourStack?.tour_state ?? {}} operatorHasSeenTours={Boolean(seenTours)}>
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
          createMenu={createMenu}
          work={
            <Suspense fallback={<WorkSidebarSkeleton />}>
              <WorkSidebar whopUserId={whopUserId} workspaceId={activeWorkspace.workspaceId} />
            </Suspense>
          }
        >
          {children}
        </ShellLayout>

        {/* Floating Mobile Nav Pill & Accordion Navigation */}
        <MobileNavPill
          displayName={displayName}
          userEmail={userEmail}
          workspaces={workspaceList}
          activeWorkspaceId={activeWorkspace.workspaceId}
        />

        <TourOverlay />
      </TourProvider>
      </ToastProvider>
    </BreadcrumbProvider>
  );
}
