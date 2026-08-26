"use client";

// src/app/dashboard/teammates/teammates-panel-content.tsx
//
// The right-utility-panel's compact Teammates tab — same TeammatesChat the
// full page renders, no extra header needed since the panel already
// titles itself "Teammates".

import { TeammatesChat } from "./teammates-chat";

export function TeammatesPanelContent() {
  return (
    <div className="h-full">
      <TeammatesChat />
    </div>
  );
}
