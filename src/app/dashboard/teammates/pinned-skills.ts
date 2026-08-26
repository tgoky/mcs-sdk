"use client";

// src/app/dashboard/teammates/pinned-skills.ts
//
// The "add as agents so you don't have to always use @" affordance from
// screenshot 3 — the '+' icon on an "Agents" panel that lets someone pick
// which skills to keep quick-access to. Lives inside Teammates (this
// folder), not as a separate top-level feature — corrected 2026-08-26
// after first describing it like a standalone thing.
//
// Persisted to localStorage rather than a new DB column: this is a
// personal per-browser UI preference (which quick-access chips someone
// wants to see), not account data other teammates or devices need to
// share — same reasoning right-utility-panel.tsx already used for its
// own persisted panel width. If cross-device persistence is wanted later,
// that's a real schema addition (a pinnedSkills column) the user would
// need to migrate themselves, not something to add silently here.

import { useCallback, useState } from "react";

const STORAGE_KEY = "mcs-teammates-pinned-skills";

export function usePinnedSkills(): { pinned: string[]; isPinned: (token: string) => boolean; toggle: (token: string) => void } {
  const [pinned, setPinned] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      // Corrupt or inaccessible localStorage — fall back to no pins
      // rather than throwing and breaking the whole chat.
      return [];
    }
  });

  const toggle = useCallback((token: string) => {
    setPinned((prev) => {
      const next = prev.includes(token) ? prev.filter((t) => t !== token) : [...prev, token];
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Best-effort — an in-memory-only pin for this session is still
        // better than throwing.
      }
      return next;
    });
  }, []);

  const isPinned = useCallback((token: string) => pinned.includes(token), [pinned]);

  return { pinned, isPinned, toggle };
}
