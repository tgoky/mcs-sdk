import { ReactNode, Suspense } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { BookingToast } from "./booking-toast";
import { SidebarSkills, SidebarSkillsSkeleton } from "./sidebar-skills";
import { SidebarNav, SidebarNavSkeleton } from "./sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Breadcrumbs } from "@/components/breadcrumbs/breadcrumbs";
import { BreadcrumbProvider } from "@/components/breadcrumbs/breadcrumb-context";
import { Home, LogOut } from "lucide-react";

// Rendered fresh on every request — never statically cached, so the sidebar
// and page below it always reflect the signed-in tenant, not a stale build.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session.whopUserId) {
    redirect("/api/auth/login");
  }

  const displayName = session.email?.split("@")[0] ?? "Member";
  const initials = displayName.slice(0, 2).toUpperCase();

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/engagements", label: "Engagements" },
    { href: "/dashboard/queue", label: "Queue" },
    { href: "/dashboard/runs", label: "Executions" },
    { href: "/dashboard/analytics", label: "Analytics" },
    { href: "/dashboard/library", label: "Library" },
    { href: "/dashboard/settings", label: "Settings" },
  ];

  return (
    <BreadcrumbProvider>
      <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 font-sans antialiased transition-colors duration-200">
        <BookingToast />

        {/* Sidebar aside menu — bg-sidebar is deliberately darker than the main
            panel (see --sidebar in globals.css) so it reads as its own panel
            instead of blending into the page behind it. */}
        <aside className="w-64 border-r border-sidebar-border bg-sidebar flex flex-col justify-between hidden md:flex transition-colors duration-200">
          <div className="flex flex-col flex-1 pt-5 pb-16 px-5 space-y-6 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {/* Brand lockup — logo mark + wordmark carry primary weight;
                "Home" (back to the account/marketing shell outside this
                app) is a secondary utility action, so it's demoted to a
                small icon-only button rather than sitting above the brand
                as its own line of text. */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-[13px] font-black text-gold-foreground shadow-sm">
                  S
                </div>
                <span className="font-mono text-sm font-bold tracking-wide text-zinc-900 dark:text-zinc-100">
                  Showtime
                </span>
              </div>
              <a
                href="/home"
                title="Back to account"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/50 transition-colors"
              >
                <Home size={14} />
              </a>
            </div>

            <Suspense fallback={<SidebarNavSkeleton />}>
              <SidebarNav whopUserId={session.whopUserId} />
            </Suspense>

            <Suspense fallback={<SidebarSkillsSkeleton />}>
              <SidebarSkills whopUserId={session.whopUserId} />
            </Suspense>
          </div>

          {/* Account footer — avatar + name/email, sign-out as an icon
              button rather than a bare text link, theme toggle kept as
              the one thing already working well here. */}
          <div className="p-3 border-t border-sidebar-border flex items-center gap-2.5 shrink-0 bg-zinc-100/60 dark:bg-zinc-900/40">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-hover text-[11px] font-bold text-gold-foreground font-mono">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{displayName}</p>
              {session.email && (
                <p className="text-[10px] text-zinc-400 dark:text-zinc-600 truncate">{session.email}</p>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <ThemeToggle />
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  title="Sign out"
             className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer bg-transparent border-none"
                >
                  <LogOut size={14} />
                </button>
              </form>
            </div>
          </div>
        </aside>

        {/* Main viewport area panel */}
        <div className="flex flex-col flex-1 min-w-0 bg-white dark:bg-zinc-950 transition-colors duration-200">
          <header className="h-14 border-b border-zinc-200 dark:border-zinc-900 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-10 gap-3">
            <MobileNav links={navLinks} displayName={displayName} />
            <div className="hidden md:flex min-w-0 flex-1">
              <Breadcrumbs />
            </div>
            <div className="flex items-center ml-auto gap-3 shrink-0">
              <NotificationBell />
            </div>
          </header>

          <main className="flex-1 p-6 md:p-8 w-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}