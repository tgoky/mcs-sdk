import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { getAvailableSlotsForTenant } from "@/lib/platforms/booking";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic"; // slots must be fetched live, never cached

/**
 * Builds the best available deep link for a given platform + slot.
 *
 * Deep-linking to an exact pre-confirmed slot isn't uniformly supported
 * across booking platforms — Cal.com's public booking page accepts a
 * `slot=` param that pre-selects the time, but Calendly's public widget
 * does not support jumping straight to a specific time (only to a date via
 * `?month=`), and neither GHL nor OnceHub expose one. Rather than promise
 * a one-tap confirm everywhere, this builds the closest real deep link per
 * platform and is honest with the copy: "Tuesday at 2pm" links to a page
 * that's already scoped to the right day/time where the platform allows
 * it, and to the general booking page otherwise.
 */
function buildSlotLink(
  platform: string,
  standardBookingUrl: string,
  slot: Date,
  meta?: Record<string, any>
): string {
  switch (platform) {
    case "cal_com": {
      if (!meta?.username) return standardBookingUrl;
      const iso = slot.toISOString();
      const date = iso.slice(0, 10);
      return `https://cal.com/${meta.username}?date=${date}&slot=${encodeURIComponent(iso)}`;
    }
    case "calendly": {
      const month = `${slot.getFullYear()}-${String(slot.getMonth() + 1).padStart(2, "0")}`;
      return `${standardBookingUrl}${standardBookingUrl.includes("?") ? "&" : "?"}month=${month}`;
    }
    default:
      return standardBookingUrl;
  }
}

export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const { engagementId } = await params;

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);

  if (!engagement) notFound();

  const stack = engagement.stack as any;
  const standardBookingUrl =
    stack.booking_standing_link ??
    `https://calendly.com/${stack.booking_platform_meta?.username ?? ""}`;

  let slots: Date[] = [];
  try {
    const apiKey = await resolveCredential(engagementId, stack.booking_platform);
    slots = await getAvailableSlotsForTenant(
      stack.booking_platform,
      apiKey,
      stack.booking_platform_meta,
      3,
      7
    );
  } catch {
    // Credential resolution or API failure — fall through to zero-slots
    // handling below, never surface an error to the prospect.
    slots = [];
  }

  const hasSlots = slots.length > 0;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 min-h-screen">
      <main className="w-full max-w-md text-center space-y-6">
        <h1 className="text-xl font-medium text-zinc-900 dark:text-zinc-100">
          {hasSlots ? "Pick a time that works" : "Find a new time"}
        </h1>

        {hasSlots ? (
          <div className="space-y-3">
            {slots.map((slot, i) => (
              <a
                key={i}
                href={buildSlotLink(stack.booking_platform, standardBookingUrl, slot, stack.booking_platform_meta)}
                className="block w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 hover:border-zinc-400 transition-colors dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {slot.toLocaleString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </a>
            ))}
            <p className="text-xs text-zinc-400 pt-2">
              Prefer a different time? <a href={standardBookingUrl} className="underline">See the full calendar</a>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-500">
              We could not pull live availability just now — use the link below to see all open times.
            </p>
            <a
              href={standardBookingUrl}
              className="inline-block rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-gold-foreground"
            >
              Open the booking page
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
