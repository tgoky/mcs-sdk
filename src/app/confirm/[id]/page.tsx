import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const revalidate = 0;

interface ConfirmPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    invitee_first_name?: string;
    invitee_last_name?: string;
    invitee_email?: string;
    assigned_to?: string;
    event_start_time?: string;
  }>;
}

/**
 * Public Post-Booking Confirmation Page
 * Location: src/app/confirm/[id]/page.tsx
 *
 * Horror Story fix — this page is shown to a cold prospect right after
 * they book, not to the buyer or their team. It previously read like a
 * sci-fi terminal ("Secure transmission link verified", "meeting
 * parameters have been correctly recorded", "Showtime Telemetry
 * Secured") — jargon a booking prospect has no context for, plus this
 * app's own internal product name ("Showtime") leaking onto a page that
 * should look like it belongs to {tenant.buyer}, not to the platform
 * running underneath. This is also the un-styled fallback route (buyers
 * can configure a custom confirmation page instead — see the 5 templates
 * in templates/), so it's competing with those on first impression.
 */
export default async function PublicBookingConfirmationPage({
  params,
  searchParams,
}: ConfirmPageProps) {
  const { id: engagementId } = await params;
  const resolvedSearchParams = await searchParams;

  // Retrieve matching profile parameters to ensure this space exists
  const tenant = await db
    .select({
      buyer: engagements.buyer,
      prospectMeets: engagements.prospectMeets,
    })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .then((r) => r[0]);

  if (!tenant) notFound();

  // Parse incoming scheduler metadata fields safely
  const rawFirstName = resolvedSearchParams.invitee_first_name ?? "";
  const rawLastName = resolvedSearchParams.invitee_last_name ?? "";
  const prospectName = `${rawFirstName} ${rawLastName}`.trim();

  const assignedHost = resolvedSearchParams.assigned_to ?? tenant.prospectMeets ?? "our team";

  // Cleanly format execution dates if available
  let localizedTimeText = "the time you selected";
  if (resolvedSearchParams.event_start_time) {
    try {
      localizedTimeText = new Date(resolvedSearchParams.event_start_time).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      // Fallback gracefully on parsing glitches
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-zinc-800 tracking-tight">
      <div className="w-full max-w-md border border-zinc-900 bg-zinc-950/60 rounded-xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
        {/* Glowing Top Context Node Ring */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[1px] w-32 bg-gradient-to-r from-transparent via-ink/40 to-transparent" />
        
        <div className="space-y-2 text-center">
          <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-950 font-black text-xs mx-auto mb-4 shadow-sm">
            {(tenant.buyer?.trim()?.[0] ?? "?").toUpperCase()}
          </div>
          <h1 className="text-lg font-medium text-zinc-100 tracking-tighter">
            You&apos;re booked
          </h1>
          <p className="text-xs text-zinc-500">
            with {tenant.buyer}
          </p>
        </div>

        <div className="border-t border-b border-zinc-900/60 py-4 space-y-3 font-sans text-xs text-zinc-400 leading-relaxed">
          <p>
            {prospectName ? (
              <>Hi <span className="text-zinc-200 font-mono font-medium">{prospectName}</span>, you&apos;re all set.</>
            ) : (
              "You're all set."
            )}
          </p>
          <p>
            You&apos;ll meet with <span className="text-zinc-200 font-medium capitalize">{assignedHost}</span> on <span className="text-ink font-mono font-medium">{localizedTimeText}</span>.
          </p>
          <p className="text-[13px] text-zinc-500 font-light pt-1">
            A calendar invite with the video link is on its way to your email. We&apos;re looking forward to the call.
          </p>
        </div>
      </div>
    </div>
  );
}