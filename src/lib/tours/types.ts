// src/lib/tours/types.ts
//
// One tour = an ordered list of steps, each anchored to a real element on
// a real page via a `data-tour="..."` attribute — not a hand-maintained
// pixel coordinate or a parallel copy of the UI. This is what makes
// branching and async waits free instead of a bespoke DSL: a step's
// target either exists in the DOM right now or it doesn't, and "doesn't"
// already means exactly what it should (a product that isn't onboarded
// yet has no Configure button to point at, so that step is skipped —
// see tour-provider.tsx's own header for how that wait/skip loop works).

import type { Placement } from "@floating-ui/react";

export interface TourStep {
  /** Unique within its own tour (and, once folded into the full
   * walkthrough, prefixed with the source tour's id — see
   * build-full-walkthrough.ts — so ids stay globally unique there too). */
  id: string;
  /** The route this step's target lives on. `{engagementId}` is
   * substituted with the workspace's primary engagement at render time —
   * every tour is scoped to that one engagement, same as the Library and
   * WorkersPanel already are when no specific engagement is in the URL. */
  route: string;
  /** CSS selector for the element to spotlight — always a
   * `[data-tour="..."]` attribute selector in practice, kept as a plain
   * string rather than a typed id registry so a step can target anything
   * without this file needing to know every page's markup. */
  target: string;
  title: string;
  body: string;
  placement?: Placement;
  /** Skips this step's DOM wait entirely when false — for a step whose
   * relevance depends on something no selector can express (e.g. "only
   * show this on desktop widths"). Rare; most branching is handled by
   * the target simply not existing. */
  enabled?: () => boolean;
}

export interface TourDefinition {
  id: string;
  label: string;
  /** One line shown in the tour picker. */
  description: string;
  steps: TourStep[];
  /** Started by code (e.g. right after a worker's setup is saved), not
   * listed in the tour picker. */
  hidden?: boolean;
}

export interface TourProgress {
  status: "in_progress" | "completed";
  currentStepId: string;
  completedStepIds: string[];
  updatedAt: string;
}

export type TourProgressMap = Partial<Record<string, TourProgress>>;
