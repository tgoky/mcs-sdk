import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { computeBookingSyncStatus } from "@/lib/booking-sync-status";
import { BookingSyncStatusCard } from "@/components/booking-sync-status-card";
import { Webhook } from "lucide-react";
import Link from "next/link";

export async function BookingSyncPanel({ whopUserId }: { whopUserId: string }) {
  const rows = await db
    .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
    .from(engagements)
    .where(eq(engagements.whopUserId, whopUserId));

  const connected = rows.filter((r) => (r.stack as EngagementStack | null)?.booking_platform);

  return (
    <div className="w-full space-y-6 transition-colors duration-200">
      <div>
        <h2 className="text-base tracking-tight" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
          Booking sync
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Auto-polling checks every 5 minutes with zero setup — fine for most accounts. A direct webhook
          enrolls a prospect the instant they book, which matters if a Pre-Call Read or a same-day Pile-On
          sequence needs to fire immediately. Both are always available per account — switch either way
          any time below.
        </p>
      </div>

      {connected.length === 0 ? (
        <div
          className="flex items-start gap-3 p-4 rounded-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <Webhook size={16} className="mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            No engagements have a booking platform connected yet. Add one from the{" "}
            <Link href="/dashboard/settings?tab=credentials" className="underline underline-offset-2">
              Credentials tab
            </Link>{" "}
            or your engagement setup, and its sync status will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {connected.map((row) => (
            <div key={row.engagementId} className="space-y-1.5">
              <div className="flex items-baseline justify-between px-0.5">
                <Link
                  href={`/dashboard/engagements/${row.engagementId}`}
                  className="text-xs font-mono font-semibold hover:underline underline-offset-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {row.buyer}
                </Link>
              </div>
              <BookingSyncStatusCard
                engagementId={row.engagementId}
                status={computeBookingSyncStatus(row.engagementId, row.stack as EngagementStack | null)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
