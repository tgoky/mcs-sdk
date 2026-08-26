import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getUpcomingWinBackTouches } from "@/lib/upcoming-touches";
import { getCallsAcrossEngagements } from "@/lib/calendar-roster";
import { getUpcomingLeakMapAudits } from "@/lib/upcoming-leak-map";
import { ListChecks, PhoneCall, RotateCcw, Radar } from "lucide-react";
import { WinBackTouchList } from "./win-back-touch-list";
import { LeakMapAuditList } from "./leak-map-audit-list";
import { CallAgendaList } from "@/app/dashboard/calendar/call-agenda-list";

export const revalidate = 0;

function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof PhoneCall; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <Icon size={13} style={{ color: "var(--text-muted)" }} />
      <h2 className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        — {subtitle}
      </span>
    </div>
  );
}

export default async function UpcomingPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);

  const rangeStart = new Date();
  const rangeEnd = new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [winBackTouches, appointments, leakMapAudits] = await Promise.all([
    getUpcomingWinBackTouches(whopUserId, activeWorkspace.workspaceId),
    getCallsAcrossEngagements(whopUserId, activeWorkspace.workspaceId, rangeStart, rangeEnd),
    getUpcomingLeakMapAudits(whopUserId, activeWorkspace.workspaceId),
  ]);

  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
          style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
        >
          <ListChecks size={16} />
        </span>
        <div className="space-y-0.5">
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Upcoming</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Everything due across all of {activeWorkspace.name}, in one caught-up view instead of checking each
            client and each skill separately.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-6">
        <section>
          <SectionHeader icon={PhoneCall} title="Next appointments" subtitle="next 14 days, every client — brief status shown per call" />
          <CallAgendaList calls={appointments} />
        </section>

        <section>
          <SectionHeader icon={RotateCcw} title="Next Win-Back touches" subtitle="what's due in the recovery cadence" />
          <WinBackTouchList touches={winBackTouches} />
        </section>

        <section>
          <SectionHeader icon={Radar} title="Next Leak Map" subtitle="each client's next scheduled audit" />
          <LeakMapAuditList audits={leakMapAudits} />
        </section>
      </div>
    </div>
  );
}
