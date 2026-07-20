import { ReactNode, Suspense } from "react";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "./notification-bell";
import { BookingToast } from "./booking-toast";
import { SidebarSkills, SidebarSkillsSkeleton } from "./sidebar-skills";
import { ThemeToggle } from "@/components/theme-toggle"; // <-- Added ThemeToggle import
import Link from "next/link";
import { Home } from "lucide-react";

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

  const navLinks = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 8H5L7 4L9 12L11 8H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      href: "/dashboard/engagements",
      label: "Engagements",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 7C10 4.79086 8.20914 3 6 3C3.79086 3 2 4.79086 2 7V13H10V7Z" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 10H14V7C14 5.34315 12.6569 4 11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="11.5" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      )
    },
    {
      href: "/dashboard/credentials",
      label: "Credentials",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 6V4.5C3 2.01472 5.01472 0 7.5 0C9.98528 0 12 2.01472 12 4.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <rect x="1" y="6" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="8" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 10.5V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 font-sans antialiased transition-colors duration-200">
      <BookingToast />
      
      {/* Sidebar aside menu */}
      <aside className="w-64 border-r border-zinc-200 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-between hidden md:flex transition-colors duration-200">
        <div className="flex flex-col flex-1 pt-5 pb-16 px-5 space-y-6 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-4">
            <a
              href="/home"
              className="flex items-center gap-2 px-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors w-fit"
            >
              <Home size={14} />
              Home
            </a>
            <div className="px-1">
              <span className="font-mono text-sm font-semibold tracking-wider text-zinc-900 dark:text-zinc-100">
                SHOWTIME
              </span>
            </div>
          </div>

          <nav className="flex flex-col space-y-0.5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center space-x-2.5 px-2 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/40 dark:hover:bg-zinc-900/30 transition-all rounded group font-medium"
              >
                <span className="text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                  {link.icon}
                </span>
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>

          <Suspense fallback={<SidebarSkillsSkeleton />}>
            <SidebarSkills whopUserId={session.whopUserId} />
          </Suspense>
        </div>

        {/* User context footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-900 flex items-center justify-between shrink-0 bg-zinc-100/50 dark:bg-zinc-900/40 gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300 truncate max-w-[100px]">
              {displayName}
            </span>
            <Link
              href="/api/auth/logout"
              className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
            >
              Sign out
            </Link>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main viewport area panel */}
      <div className="flex flex-col flex-1 min-w-0 bg-white dark:bg-zinc-950 transition-colors duration-200">
        <header className="h-14 border-b border-zinc-200 dark:border-zinc-900 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-10">
          <MobileNav links={navLinks} displayName={displayName} />
          <div className="flex items-center ml-auto gap-3">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 w-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </main>
      </div>
    </div>
  );
}