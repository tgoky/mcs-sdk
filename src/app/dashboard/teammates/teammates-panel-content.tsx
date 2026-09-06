"use client";

// src/app/dashboard/teammates/teammates-panel-content.tsx
//
// The right-utility-panel's compact Teammates tab — same TeammatesChat the
// full page renders, no extra header needed since the panel already
// titles itself "Teammates".
//
// `initialThreadId` is owned by right-utility-panel.tsx, not this
// component — its header carries the one control (a "new conversation"
// Plus button, next to Expand/Close) that needs to force TeammatesChat
// to drop whichever thread localStorage remembers and start blank,
// mirroring teammates-workspace.tsx's own startNewChat/epoch pattern.
// Leaving it undefined here (the default, compact-mode-with-no-override
// case) preserves the original behavior exactly: TeammatesChat reads the
// last active thread from localStorage itself.

import { TeammatesChat } from "./teammates-chat";

export function TeammatesPanelContent({ initialThreadId }: { initialThreadId?: string | null }) {
  return (
    <div className="h-full">
      <TeammatesChat initialThreadId={initialThreadId} />
    </div>
  );
}
