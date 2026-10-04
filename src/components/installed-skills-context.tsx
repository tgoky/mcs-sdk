"use client";

// The skills a client actually has switched on, from the dashboard layout's
// CreateMenuContext. Lets the Teammates @ picker list only those (grouped
// by their installed product) instead of the whole registry.

import { createContext, useContext, type ReactNode } from "react";
import type { CreateMenuContext } from "@/components/top-nav";

const InstalledSkillsContext = createContext<CreateMenuContext | null>(null);

export function InstalledSkillsProvider({ value, children }: { value: CreateMenuContext | undefined; children: ReactNode }) {
  return <InstalledSkillsContext.Provider value={value ?? null}>{children}</InstalledSkillsContext.Provider>;
}

/** null outside the dashboard shell (no provider), or when no client exists. */
export function useInstalledSkillsContext(): CreateMenuContext | null {
  return useContext(InstalledSkillsContext);
}
