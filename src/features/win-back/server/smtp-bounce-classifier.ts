// src/features/win-back/server/smtp-bounce-classifier.ts
//
// Phase 6 — bounce detection for the "smtp" email_platform, where this
// app owns the whole send loop (win-back-email-smtp.ts) and there's no
// ESP account to subscribe a webhook to. Per RFC 3464, a real bounce
// comes back as a Delivery Status Notification (DSN) — there's no
// simpler "webhook" shape for raw SMTP because there's no vendor account
// to register one with; the only channel this app already has into the
// client's mailbox is the same inbound-reply forwarding bridge Win-Back
// recovery gap 6 built (src/app/api/webhooks/inbound-reply/[engagementId]
// /route.ts) — an operator who wants SMTP bounce detection points their
// bounce/postmaster mailbox's forwarding rule at that same bridge
// alongside their reply-forwarding rule.
//
// Deliberately reuses, not reinvents, the delivery-failure phrasing
// already proven in production in this exact codebase
// (reply-classifier.ts's AUTO_RE, Cold Open's reply classifier) —
// narrowed to JUST the bounce-indicating subset (excludes OOO/vacation
// phrasing, which AUTO_RE also matches but which isn't a bounce).
//
// Honesty note this module does NOT paper over: there is no equivalent
// signal for spam complaints on raw SMTP. Feedback Loops (FBLs) are
// bilateral, mailbox-provider-specific registrations (Yahoo, Microsoft,
// etc.) with no unified protocol — a real, separate undertaking this
// module doesn't attempt. complained-rate monitoring for "smtp" is a
// known, documented gap, not silently treated as covered — see
// esp-delivery-monitor.ts's own complaint-rate check, which will simply
// never see an "smtp" complaint event and so never trigger on that leg
// alone (bounce-rate monitoring still works for smtp).

const BOUNCE_SENDER_RE = /mailer-daemon|postmaster|mail delivery subsystem|delivery status notification/i;
const BOUNCE_SUBJECT_OR_BODY_RE =
  /delivery (?:has )?failed|undeliverab|could not be delivered|returned to sender|delivery status notification|permanent failure|550 |mailbox (?:unavailable|full)|unknown user|no such user/i;

export function looksLikeBounceNotification(fromEmail: string, subject: string, textBody: string): boolean {
  if (BOUNCE_SENDER_RE.test(fromEmail)) return true;
  return BOUNCE_SUBJECT_OR_BODY_RE.test(subject) || BOUNCE_SUBJECT_OR_BODY_RE.test(textBody);
}

/** Best-effort extraction of the original failed recipient from a DSN
 * body — real bounce formats vary a lot (this is not a standardized
 * field to parse the way a webhook's JSON would be), so this is a
 * best-effort regex, not a guarantee. Returns null rather than a wrong
 * guess when nothing matches; the rate computation only needs the
 * event COUNT, not a correct per-event email, so a null here doesn't
 * degrade the auto-pause signal itself. */
export function extractBouncedRecipient(textBody: string): string | null {
  const patterns = [
    /(?:to|recipient|address)[:\s]+<?([\w.+-]+@[\w.-]+\.\w+)>?/i,
    /<?([\w.+-]+@[\w.-]+\.\w+)>?\s*(?:failed|bounced|rejected|unavailable)/i,
  ];
  for (const re of patterns) {
    const match = textBody.match(re);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return null;
}
