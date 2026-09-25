"use client";

// src/components/worker-config-forms/config-form-registry.tsx
//
// The one place that knows which config form belongs to which worker.
// Every surface that shows a worker's settings (the client page's workers
// panel, the Library's product page, a skill page's Configure menu, the
// Cold Open findings panel, and the setup page at bridges/[workerId])
// renders through renderWorkerConfigForm instead of its own copy of this
// list. Those copies had drifted: the Library had no form for the five
// Cold Open workers or Whop Connect, and the workers panel had none for
// Whop Connect, so Configure opened an empty panel there.
//
// Adding a worker's form means adding one entry here.

import type { ReactNode } from "react";
import type { WorkerId } from "@/lib/worker-registry";
import { ShowtimeSetup } from "@/components/product-setup/showtime-setup";
import { WinBackConfigForm } from "./win-back-config-form";
import { PreCallReadConfigForm } from "./pre-call-read-config-form";
import { PileOnConfigForm } from "./pile-on-config-form";
import { LeakMapConfigForm } from "./leak-map-config-form";
import { RepSetup } from "@/components/product-setup/rep-setup";
import { ColdOpenSetup } from "@/components/product-setup/cold-open-setup";
import { WhopSetup } from "@/components/product-setup/whop-setup";
import { RepEnginePanelConfigForm } from "./rep-engine-panel-config-form";
import { RepTrustpilotWatchConfigForm } from "./rep-trustpilot-watch-config-form";
import { RepRedditWatchConfigForm } from "./rep-reddit-watch-config-form";
import { RepTwitterWatchConfigForm } from "./rep-twitter-watch-config-form";
import { COLD_OPEN_SKILL_IDS } from "@/lib/cold-open-skill-manifest";
import { REP_SKILL_IDS } from "@/lib/rep-skill-manifest";
import { WHOP_AGENT_SKILL_IDS } from "@/lib/whop-agent-skill-manifest";

export interface ConfigFormSaveResult {
  /** The run a setup form started on save, when it started one. */
  runId?: string;
}

export interface ConfigFormHandlers {
  engagementId: string;
  /** Cancel — and, for forms that save in place, the way out afterwards. */
  onClose: () => void;
  /** Called by forms that report a completed save. Forms that save in
   * place and show their own confirmation never call it. */
  onSaved?: (result: ConfigFormSaveResult) => void;
  /** Label for the form's own cancel/close button; each form has a default. */
  cancelLabel?: string;
  /** "setup" is the product's onboarding page (bridges/[workerId]): the
   * full setup, every skill and its switch, for the product's onboarding
   * worker. Anywhere else, and for every other worker, a product's setup
   * opens as that one skill's own settings (see each setup's `focus`). */
  mode?: "setup" | "settings";
  /** For a self-headed form (its own mark and title, not "Configure X"):
   * the way back, so it can put the back button on the same line as its
   * own heading instead of the page rendering one above it. Only forms
   * that carry their own heading read this. */
  backHref?: string;
}

type FormRenderer = (h: ConfigFormHandlers) => ReactNode;

// Forms that only take onCancel (they save in place and show "Saved").
const simple = (Form: (props: { engagementId: string; onCancel: () => void; cancelLabel?: string }) => ReactNode): FormRenderer => {
  function SimpleForm(h: ConfigFormHandlers) {
    return <Form engagementId={h.engagementId} onCancel={h.onClose} cancelLabel={h.cancelLabel} />;
  }
  return SimpleForm;
};

// A product setup as one skill's settings. The onboarding worker's own
// setup page shows the whole setup instead.
const focused = (
  Setup: (props: { engagementId: string; onCancel: () => void; onSaved?: ConfigFormHandlers["onSaved"]; cancelLabel?: string; focus?: string }) => ReactNode,
  onboarding: WorkerId,
  id: WorkerId
): FormRenderer => {
  function SkillSettings(h: ConfigFormHandlers) {
    return <Setup engagementId={h.engagementId} onCancel={h.onClose} onSaved={h.onSaved} cancelLabel={h.cancelLabel} focus={h.mode === "setup" && id === onboarding ? undefined : id} />;
  }
  return SkillSettings;
};

// The Rep watches whose form is a one-off "scan further back" action, not
// settings; they keep it.
const REP_OWN_FORMS: Partial<Record<WorkerId, FormRenderer>> = {
  "rep-engine-panel": simple(RepEnginePanelConfigForm),
  "rep-trustpilot-watch": simple(RepTrustpilotWatchConfigForm),
  "rep-reddit-watch": simple(RepRedditWatchConfigForm),
  "rep-twitter-watch": simple(RepTwitterWatchConfigForm),
};

const FORMS: Partial<Record<WorkerId, FormRenderer>> = {
  // Showtime
  // Showtime's setup covers every Showtime skill from the website and the
  // connected tools; Pin-Down is the worker it lives under.
  "pin-down": (h) => (
    <ShowtimeSetup
      engagementId={h.engagementId}
      onCancel={h.onClose}
      onSaved={h.onSaved}
      cancelLabel={h.cancelLabel}
      focus={h.mode === "setup" ? undefined : "pin-down"}
      backHref={h.backHref}
    />
  ),
  // PileOnConfigForm always re-fetches its own current values on mount
  // (see its own useEffect) — these two "initial" props are only the
  // pre-fetch default, so a generic caller with nothing better to pass
  // (this registry's ConfigFormHandlers carries no pile-on-specific data)
  // can safely default them to "none" without the form ever showing a
  // wrong saved value. SkillConfigureMenu still passes real prefetched
  // values directly to PileOnConfigForm where it already has them, purely
  // to skip that fetch's flash; both paths land on the same form.
  "pile-on": (h) => (
    <PileOnConfigForm
      engagementId={h.engagementId}
      initialSmsPlatform="none"
      initialAdDataPlatform="none"
      onCancel={h.onClose}
      onSaved={() => h.onSaved?.({})}
    />
  ),
  "win-back": simple(WinBackConfigForm),
  "pre-call-read": simple(PreCallReadConfigForm),
  "leak-map": simple(LeakMapConfigForm),
  // Reputation Manager, Cold Open and Whop Agent: every skill opens its
  // product's review narrowed to the rows it owns.
  ...Object.fromEntries(REP_SKILL_IDS.map((id) => [id, REP_OWN_FORMS[id] ?? focused(RepSetup, "rep-onboarding", id)])),
  ...Object.fromEntries(COLD_OPEN_SKILL_IDS.map((id) => [id, focused(ColdOpenSetup, "icp-lock", id)])),
  ...Object.fromEntries(WHOP_AGENT_SKILL_IDS.map((id) => [id, focused(WhopSetup, "whop-connect", id)])),
};

/** Workers with a self-loading config form. */
export const WORKERS_WITH_CONFIG_FORM = Object.keys(FORMS) as WorkerId[];

export function hasWorkerConfigForm(workerId: string): workerId is WorkerId {
  return Object.prototype.hasOwnProperty.call(FORMS, workerId);
}

/** The worker's config form wired to the given handlers, or null when it
 * has none. */
export function renderWorkerConfigForm(workerId: WorkerId, handlers: ConfigFormHandlers): ReactNode {
  const render = FORMS[workerId];
  return render ? render(handlers) : null;
}
