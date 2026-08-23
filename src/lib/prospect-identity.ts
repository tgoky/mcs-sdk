// src/lib/prospect-identity.ts
//
// Fix: every webhook-payload name extraction across this codebase
// (enrollment-service.ts, booking-roster.ts) fell back to the literal
// string "Prospect" when a platform's payload shape didn't carry a
// first_name/name field — which then got stored as-is in
// booking_roster.prospect_name / win_back_enrollments.prospect_name and
// surfaced verbatim in the dashboard (Booking Recovery, Master Roster,
// Meetings) as if "Prospect" were someone's actual name. That's not a
// missing-data state a reader can tell apart from a real (unusually
// generic) name — it just looks like broken data.
//
// This derives a real, identifying fallback from the email's local part
// instead ("kelechikelvinanthony@gmail.com" → "Kelechikelvinanthony"),
// and returns null — not a placeholder string — when there's no email
// either. Every UI call site already has its own null fallback
// ("Unnamed Prospect", or the email itself), so null here means "let
// that fallback do its job" instead of shadowing it with fake data.
export function deriveProspectName(rawName: string | undefined | null, email: string): string | null {
  const trimmedName = rawName?.trim();
  if (trimmedName) return trimmedName;

  const localPart = email.split("@")[0]?.trim();
  if (!localPart) return null;

  return localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
