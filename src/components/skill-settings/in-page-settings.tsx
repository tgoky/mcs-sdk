"use client";

// src/components/skill-settings/in-page-settings.tsx
//
// A page's skill list with its settings pane beside it, the way run
// history shows a run's details: a gear in the list opens that skill's
// settings here (not at the app's right edge), the list narrows and
// stays usable, and another gear swaps what's shown. The list gets the
// open skill, to highlight its row and fold the long rows while the pane
// is open. Opening here closes the app-edge pane, so only one is open.

import { useCallback, useState, type ReactNode } from "react";
import { SkillPaneProvider, useSkillPane } from "./skill-pane-context";
import { SkillSettingsPane } from "./skill-settings-pane";

const WIDTH_KEY = "mcs-inline-settings-width";
const DEFAULT_WIDTH = 440;

export function InPageSettings({ children }: { children: (openSkillId: string | null) => ReactNode }) {
  const shell = useSkillPane();
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    try {
      const n = Number(window.localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const onWidth = useCallback((w: number) => {
    setWidth(w);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(w));
    } catch {
      // Not remembered.
    }
  }, []);
  const closeShell = shell?.close;
  return (
    <SkillPaneProvider scope="inline" onOpen={closeShell}>
      <div className="flex items-start">
        <List>{children}</List>
        <SkillSettingsPane variant="inline" width={width} onWidthChange={onWidth} />
      </div>
    </SkillPaneProvider>
  );
}

function List({ children }: { children: (openSkillId: string | null) => ReactNode }) {
  const pane = useSkillPane();
  return <div className="min-w-0 flex-1">{children(pane?.current?.skillId ?? null)}</div>;
}
