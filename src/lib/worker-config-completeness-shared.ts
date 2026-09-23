// src/lib/worker-config-completeness-shared.ts
//
// Split out of worker-config-completeness.ts so a client component can
// know the shape of a missing-field entry (MissingField) and which
// workers have real required fields (CONFIG_CHECKED_WORKER_IDS) without
// pulling in that file's server-only imports (db, credentials ->
// composio -> fs/os) — found the hard way: importing
// worker-config-completeness.ts directly from workers-panel.tsx
// ("use client") broke the Turbopack client bundle (Module not found:
// Can't resolve 'fs').
//
// CONFIG_CHECKED_WORKER_IDS here and worker-config-completeness.ts's own
// CHECKERS map are meant to have exactly the same keys — that file
// asserts it at module load (dev-only), so the two can't silently drift
// apart the way a hand-maintained second list risks.

import type { WorkerId } from "@/lib/worker-registry";

export interface MissingField {
  key: string;
  label: string;
  reason: string;
}

export const CONFIG_CHECKED_WORKER_IDS: readonly WorkerId[] = [
  "pin-down",
  "pile-on",
  "win-back",
  "leak-map",
  "pre-call-read",
  "rep-onboarding",
  "rep-engine-panel",
  "rep-trustpilot-watch",
  "rep-reddit-watch",
  "rep-twitter-watch",
  "rep-crisis-response",
  "rep-digest",
  "icp-lock",
  "voice-capture",
  "source-connect",
  "send-connect",
  "daily-send",
  "whop-connect",
  "whop-cancellation-save-offer",
  "whop-bridge-manager",
];
