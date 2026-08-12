import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";
import { computeBookingSyncStatus } from "@/lib/booking-sync-status";
import { bookingPlatformLabel } from "@/lib/copy";
import { RefreshCw, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";

export default async function BookingSyncSettingsPage() {
  const session = await getSession();
  if (!session.whopUserId) return null;

  const clientEngagements = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      stack: engagements.stack,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.whopUserId, session.whopUserId),
        isNull(engagements.deletedAt)
      )
    );

  const syncStatuses = clientEngagements.map((item) => {
    const stack = item.stack as EngagementStack | null;
    const syncStatus = computeBookingSyncStatus(item.engagementId, stack);
    return {
      engagementId: item.engagementId,
      buyer: item.buyer,
      platformLabel: bookingPlatformLabel(stack?.booking_platform),
      syncStatus,
    };
  });

  return (
    <div className="max-w-4xl space-y-6 font-sans">
      <div>
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight">
          Booking Sync
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Monitor and manage webhook delivery and automated polling across your connected calendar platforms.
        </p>
      </div>

      {syncStatuses.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-xs text-zinc-400">
          No client engagements configured yet. Add a client to monitor booking sync health.
        </div>
      ) : (
        <div className="space-y-4">
          {syncStatuses.map(({ engagementId, buyer, platformLabel, syncStatus }) => (
            <div
              key={engagementId}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4"
            >
              {/* Client Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-200">{buyer}</h2>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">
                    Platform: {platformLabel}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-zinc-950">
                  {syncStatus.health === "healthy" && (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">{syncStatus.headline}</span>
                    </>
                  )}
                  {syncStatus.health === "warning" && (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-400">{syncStatus.headline}</span>
                    </>
                  )}
                  {syncStatus.health === "error" && (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      <span className="text-rose-400">{syncStatus.headline}</span>
                    </>
                  )}
                  {syncStatus.health === "unconfigured" && (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-zinc-400">{syncStatus.headline}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Sync Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-500 block text-[11px] font-mono uppercase tracking-wider">
                    Sync Mode &amp; Status
                  </span>
                  <p className="text-zinc-300 mt-1 leading-relaxed">{syncStatus.detail}</p>
                </div>

                <div>
                  <span className="text-zinc-500 block text-[11px] font-mono uppercase tracking-wider">
                    Last Activity
                  </span>
                  <p className="text-zinc-300 font-mono mt-1">
                    {syncStatus.lastActivityAt
                      ? new Date(syncStatus.lastActivityAt).toLocaleString()
                      : "No activity recorded"}
                  </p>
                </div>
              </div>

              {/* Inbound Webhook Receiver URL */}
              {syncStatus.webhookUrl && (
                <div className="pt-2 border-t border-zinc-800/80">
                  <span className="text-zinc-500 block text-[11px] font-mono uppercase tracking-wider mb-1.5">
                    Inbound Webhook Receiver URL
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={syncStatus.webhookUrl}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-xs font-mono text-zinc-300 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}