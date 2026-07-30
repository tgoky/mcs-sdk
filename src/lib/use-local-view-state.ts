"use client";

// Persists small view-preference state (active tab, pinned/active
// customize chips, time range, page size) to localStorage, scoped per
// storageKey, so a user's chosen view survives reloads and page
// navigation without a database change.
//
// Uses `useSyncExternalStore` to maintain hydration safety (returns
// `defaultValue` during SSR and initial paint) while eliminating cascading
// render warnings from effect-based state synchronization.

import { useCallback, useSyncExternalStore } from "react";

// In-memory event bus to notify components in the current tab when localStorage changes
const listeners = new Set<() => void>();
const emitChange = () => listeners.forEach((listener) => listener());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLocalViewState<T>(storageKey: string, defaultValue: T) {
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);

  const getServerSnapshot = useCallback(() => null, []);

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  let value: T = defaultValue;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = defaultValue;
    }
  }

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      try {
        const currentRaw = window.localStorage.getItem(storageKey);
        let currentVal = defaultValue;
        if (currentRaw !== null) {
          try {
            currentVal = JSON.parse(currentRaw) as T;
          } catch {
            currentVal = defaultValue;
          }
        }

        const resolved = typeof next === "function" ? (next as (p: T) => T)(currentVal) : next;
        window.localStorage.setItem(storageKey, JSON.stringify(resolved));
        emitChange();
      } catch {
        // Quota exceeded / private mode — fallback safely
      }
    },
    [storageKey, defaultValue]
  );

  return [value, update] as const;
}