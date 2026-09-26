// src/lib/booking-outcome-events.ts
//
// Whether someone showed, read from the booking tool the client already
// marks it in, so nobody has to mark it twice:
//
//   Calendly     → invitee_no_show.created, sent when a host marks an
//                  invitee as a no-show. Its payload names the invitee by
//                  URI (…/scheduled_events/{event}/invitees/{invitee}).
//                  Calendly has no "showed" mark, so only no-shows come
//                  from here.
//   GoHighLevel  → AppointmentUpdate with appointment.appointmentStatus
//                  "showed" or "noshow" (the statuses in HighLevel's own
//                  published API schema: new, confirmed, cancelled,
//                  showed, noshow, invalid). A workflow webhook may put the
//                  appointment at the top level or under "calendar", so
//                  those shapes are read too.
//
// Anything else is not an outcome and goes through the normal booking path.

export type PlatformOutcome = {
  outcome: "showed" | "no_show";
  /** The ids this booking may be stored under, most specific first. */
  bookingIds: string[];
};

const lastSegment = (uri: unknown): string | null => {
  if (typeof uri !== "string") return null;
  const seg = uri.replace(/\/+$/, "").split("/").pop();
  return seg || null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" ? (v as Obj) : null);

export function detectPlatformOutcome(platform: string | undefined, payload: unknown): PlatformOutcome | null {
  const p = obj(payload);
  if (!p) return null;

  if (platform === "calendly") {
    if (p.event !== "invitee_no_show.created") return null;
    const body = obj(p.payload);
    const inviteeUri = typeof body?.invitee === "string" ? body.invitee : typeof obj(body?.invitee)?.uri === "string" ? (obj(body?.invitee)!.uri as string) : null;
    if (!inviteeUri) return null;
    // The roster keys a Calendly booking by its invitee id (the last part
    // of the invitee URI); the scheduled event's id is the fallback.
    const eventId = /scheduled_events\/([^/]+)/.exec(inviteeUri)?.[1] ?? null;
    const ids = [lastSegment(inviteeUri), eventId].filter((x): x is string => Boolean(x));
    return ids.length ? { outcome: "no_show", bookingIds: [...new Set(ids)] } : null;
  }

  if (platform === "ghl_calendar") {
    const appointment = obj(p.appointment) ?? obj(p.calendar) ?? p;
    const status = String(appointment.appointmentStatus ?? appointment.status ?? p.appointmentStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
    const outcome = status === "showed" ? "showed" : status === "noshow" ? "no_show" : null;
    if (!outcome) return null;
    const ids = [appointment.id, appointment.appointmentId, p.id].filter((x): x is string => typeof x === "string" && x.length > 0);
    return ids.length ? { outcome, bookingIds: [...new Set(ids)] } : null;
  }

  return null;
}
