"use client";

// src/app/dashboard/autopilot/autopilot-panel-content.tsx
//
// The right-utility-panel's compact Autopilot tab — same AutopilotTable the
// full /dashboard/autopilot page renders, just fetched client-side (the
// panel lives inside shell-layout.tsx, not a server component) and lazily,
// only once this tab is actually opened rather than on every dashboard load.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AutopilotTable, type AutopilotClientRow } from "./autopilot-table";

export function AutopilotPanelContent() {
  const [clients, setClients] = useState<AutopilotClientRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/engagements/autopilot-summary", { signal: controller.signal, cache: "no-store" });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = await res.json();
        if (controller.signal.aborted) return;
        setClients(data.clients ?? []);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full px-4 text-center">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Couldn&apos;t load Autopilot — try Expand for the full page.
        </p>
      </div>
    );
  }

  if (!clients) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="flex items-center justify-center h-full px-4 text-center">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No clients yet — add one from Engagements to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 overflow-y-auto h-full">
      <AutopilotTable clients={clients} />
    </div>
  );
}
