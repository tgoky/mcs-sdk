// src/lib/queue-repair-action.ts
//
// See "Observation 6: Needs Action queue offers wrong / dangerous actions
// on every item" (UTP Handoff, 2026-08-07). The row's "Fix now" button and
// its dropdown quick-actions menu used to disagree — the button promised a
// fix, the menu offered "Generate a Leak Map" and "Resume automations"
// instead, neither of which touches whatever actually failed. That taught
// the operator that buttons in this app don't mean what they say, which is
// the most expensive thing an ops tool can teach.
//
// This file is the single place that decides "what is the one real repair
// action for this item" — both queue-panel.tsx's row button and its
// quick-actions menu call getRepairAction() and render whatever it
// returns, so the two surfaces can never drift apart again. If there's no
// genuine, already-wired fix to point at, this returns null and the caller
// falls back to a plain "Open" navigation instead of inventing a button
// that doesn't do what it says.

import type { StackSection } from "@/lib/error-classification";

export type RepairActionSource = "run_failure" | "sync_setup" | string;

export interface RepairActionItem {
  source: RepairActionSource;
  engagementId: string | null;
  skillName?: string;
  isCredentialIssue?: boolean;
  diagnosisSection?: StackSection;
  fixHref?: string;
  /** See QueueItem.skillEnabledForClient in lib/queue.ts — undefined/true
   * both read as "assume available", only an explicit false gates it off. */
  skillEnabledForClient?: boolean;
}

/** Kept in sync with the identical constant in lib/queue.ts (which sets
 * skillEnabledForClient) and with the real server-side support in
 * src/app/api/skill-runs/trigger/route.ts. */
const RETRIGGERABLE_SKILLS = new Set(["pre-call-read", "leak-map"]);

/**
 * Describes an in-place drawer a "link" repair can open instead of a full
 * page navigation — see QueueFixDrawer. Optional: a "link" repair with no
 * `drawer` genuinely has nowhere in-place to land (e.g. a run detail page)
 * and should navigate normally.
 */
export interface DrawerTarget {
  type: "stack" | "credentials";
  /** Which Edit Stack Settings section to scroll to/highlight; irrelevant for "credentials". */
  section?: string | null;
}

export type RepairAction =
  | { kind: "link"; key: string; label: string; href: string; drawer?: DrawerTarget }
  | { kind: "trigger"; key: string; label: string; engagementId: string; skillName: string };

/**
 * Returns the single real repair action for a queue/failure item, or null
 * when nothing here can point at one — in which case the caller should
 * fall back to a plain "Open run" / "Open engagement" link rather than
 * relabeling that as a fix.
 *
 * `drawer`, when present, is the one source of truth both the row button
 * (queue-panel.tsx's handleFixLinkClick) and the "..." quick-actions menu
 * (repairActionItem) read to decide "open the in-place drawer" vs. "follow
 * the link" — neither surface re-derives this by pattern-matching the
 * href, so they can't drift apart the way they used to (see the file
 * header comment above).
 */
export function getRepairAction(item: RepairActionItem): RepairAction | null {
  if (item.source === "run_failure") {
    if (item.isCredentialIssue && item.fixHref) {
      return {
        kind: "link",
        key: "update-credential",
        label: "Update credential",
        href: item.fixHref,
        drawer: { type: "credentials" },
      };
    }

    if (
      item.skillName &&
      RETRIGGERABLE_SKILLS.has(item.skillName) &&
      item.skillEnabledForClient !== false &&
      item.engagementId
    ) {
      return {
        kind: "trigger",
        key: "run-again",
        label: "Run again",
        engagementId: item.engagementId,
        skillName: item.skillName,
      };
    }

    if (item.fixHref) {
      return {
        kind: "link",
        key: "fix-settings",
        label: "Fix settings",
        href: item.fixHref,
        drawer: item.diagnosisSection ? { type: "stack", section: item.diagnosisSection } : undefined,
      };
    }

    return null;
  }

  if (item.source === "sync_setup" && item.engagementId) {
    // There's no standalone "retry sync" endpoint to call — the real fix
    // is completing or reviewing the webhook setup in Edit stack
    // settings, the same section a booking-platform run failure lands on
    // (see booking-sync-status.ts / edit-stack-settings.tsx). Labeled for
    // what actually happens on click rather than "Retry sync", which
    // would promise a retry this item can't perform.
    return {
      kind: "link",
      key: "setup-webhook",
      label: "Set up webhook",
      href: `/dashboard/engagements/${item.engagementId}?fixSection=booking#stack-settings`,
      drawer: { type: "stack", section: "booking" },
    };
  }

  return null;
}
