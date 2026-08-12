import Link from "next/link";
import { CalendarClock, History, FileText, Link2 } from "lucide-react";

/**
 * The "Meetings" section's secondary sidebar — Anthony's own "look into
 * this" ask. Built on data that already exists (briefedCallsLog.callTime
 * per engagement, the GHL calendar picker in engagements/[id]/edit-stack-
 * settings.tsx, and the booking-sync status already computed in
 * lib/booking-sync-status.ts), not a new integration. See
 * /dashboard/meetings/page.tsx for the reasoning on why this earns its own
 * primary-rail slot instead of staying buried in each client's page.
 */
export function MeetingsSidebar() {
  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/dashboard/meetings"
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900 transition-all"
      >
        <CalendarClock className="w-4 h-4 text-ink dark:text-ink-hover" />
        <span>Upcoming</span>
      </Link>

      <nav className="flex flex-col gap-0.5 mt-1">
        <Link
          href="/dashboard/meetings?range=past"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <History className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Past calls</span>
        </Link>

        <Link
          href="/dashboard/modules/pre-call-read"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <FileText className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Pre-Call Reads</span>
        </Link>

        <Link
          href="/dashboard/settings"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
          <Link2 className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <span>Calendar connections</span>
        </Link>
      </nav>
    </div>
  );
}
