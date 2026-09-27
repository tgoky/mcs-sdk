"use client";

// src/components/skill-settings/skill-pane-context.tsx
//
// Which skill's Configure is open in the pane beside the page (see
// skill-settings-pane.tsx), shared by the shell that shows the pane and
// the gears deep in any page that open it. Swapping to another skill
// while one has unsaved changes asks first instead of dropping them.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface PaneSkill {
  engagementId: string;
  skillId: string;
  /** Only these settings (paths): opened from a setup page, the ones it doesn't ask. */
  only?: string[];
}

interface SkillPaneState {
  /** Open in the pane now. */
  current: PaneSkill | null;
  /** Asked for while the open one has unsaved changes. */
  pending: PaneSkill | null;
  open: (skill: PaneSkill) => void;
  close: () => void;
  /** Throw away the open one's changes and go where was asked. */
  discard: () => void;
  keepEditing: () => void;
  setDirty: (dirty: boolean) => void;
}

const SkillPaneContext = createContext<SkillPaneState | null>(null);

const SHELL_OPENED = "skill-settings:shell-opened";

/**
 * `shell` is the app's right edge (one, in the dashboard shell); `inline`
 * is a page's own pane beside its list. Opening the shell's closes any
 * page's, and a page's closes the shell's (its onOpen), so one is open.
 */
export function SkillPaneProvider({ children, onOpen, scope = "shell" }: { children: ReactNode; onOpen?: () => void; scope?: "shell" | "inline" }) {
  const [current, setCurrent] = useState<PaneSkill | null>(null);
  const [pending, setPending] = useState<PaneSkill | null>(null);
  const dirty = useRef(false);

  const currentRef = useRef<PaneSkill | null>(null);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const open = useCallback(
    (skill: PaneSkill) => {
      onOpen?.();
      if (scope === "shell") window.dispatchEvent(new Event(SHELL_OPENED));
      const cur = currentRef.current;
      if (cur && cur.skillId === skill.skillId && cur.engagementId === skill.engagementId) return;
      if (cur && dirty.current) {
        setPending(skill);
        return;
      }
      dirty.current = false;
      setPending(null);
      currentRef.current = skill;
      setCurrent(skill);
    },
    [onOpen, scope]
  );
  const close = useCallback(() => {
    currentRef.current = null;
    setCurrent(null);
    setPending(null);
    dirty.current = false;
  }, []);
  const discard = useCallback(() => {
    dirty.current = false;
    currentRef.current = pending;
    setCurrent(pending);
    setPending(null);
  }, [pending]);
  const keepEditing = useCallback(() => setPending(null), []);

  useEffect(() => {
    if (scope !== "inline") return;
    window.addEventListener(SHELL_OPENED, close);
    return () => window.removeEventListener(SHELL_OPENED, close);
  }, [scope, close]);
  const setDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  const value = useMemo(() => ({ current, pending, open, close, discard, keepEditing, setDirty }), [current, pending, open, close, discard, keepEditing, setDirty]);
  return <SkillPaneContext.Provider value={value}>{children}</SkillPaneContext.Provider>;
}

/** Null outside the dashboard shell (a gear there falls back to the settings page). */
export function useSkillPane(): SkillPaneState | null {
  return useContext(SkillPaneContext);
}

/** A skill's own settings page; `from` is where Back returns to. */
export function skillSettingsHref(engagementId: string, skillId: string, from?: string): string {
  const base = `/dashboard/engagements/${encodeURIComponent(engagementId)}/skills/${encodeURIComponent(skillId)}/settings`;
  return from ? `${base}?from=${encodeURIComponent(from)}` : base;
}

/** Where the browser is now, to come back to. */
export function hereForBack(): string | undefined {
  return typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`;
}
