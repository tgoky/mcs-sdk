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
import { LeakMapConfigForm } from "./leak-map-config-form";
import { RepSetup } from "@/components/product-setup/rep-setup";
import { ColdOpenSetup } from "@/components/product-setup/cold-open-setup";
import { WhopSetup } from "@/components/product-setup/whop-setup";
import { RepEnginePanelConfigForm } from "./rep-engine-panel-config-form";
import { RepTrustpilotWatchConfigForm } from "./rep-trustpilot-watch-config-form";
import { RepRedditWatchConfigForm } from "./rep-reddit-watch-config-form";
import { RepTwitterWatchConfigForm } from "./rep-twitter-watch-config-form";
import { VoiceCaptureConfigForm } from "./voice-capture-config-form";
import { SourceConnectConfigForm } from "./source-connect-config-form";
import { SendConnectConfigForm } from "./send-connect-config-form";
import { DailySendConfigForm } from "./daily-send-config-form";

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
}

type FormRenderer = (h: ConfigFormHandlers) => ReactNode;

// Forms that only take onCancel (they save in place and show "Saved").
const simple =
  (Form: (props: { engagementId: string; onCancel: () => void; cancelLabel?: string }) => ReactNode): FormRenderer =>
  (h) => <Form engagementId={h.engagementId} onCancel={h.onClose} cancelLabel={h.cancelLabel} />;

const FORMS: Partial<Record<WorkerId, FormRenderer>> = {
  // Showtime
  // Showtime's setup covers every Showtime skill from the website and the
  // connected tools; Pin-Down is the worker it lives under.
  "pin-down": (h) => <ShowtimeSetup engagementId={h.engagementId} onCancel={h.onClose} onSaved={h.onSaved} cancelLabel={h.cancelLabel} />,
  "win-back": simple(WinBackConfigForm),
  "pre-call-read": simple(PreCallReadConfigForm),
  "leak-map": simple(LeakMapConfigForm),
  // Reputation Manager
  "rep-onboarding": (h) => <RepSetup engagementId={h.engagementId} onCancel={h.onClose} onSaved={h.onSaved} cancelLabel={h.cancelLabel} />,
  "rep-engine-panel": simple(RepEnginePanelConfigForm),
  "rep-trustpilot-watch": simple(RepTrustpilotWatchConfigForm),
  "rep-reddit-watch": simple(RepRedditWatchConfigForm),
  "rep-twitter-watch": simple(RepTwitterWatchConfigForm),
  // Cold Open
  // Cold Open's setup covers the product, buyers, voice, campaigns and
  // daily sending from the website and the connected tools.
  "icp-lock": (h) => <ColdOpenSetup engagementId={h.engagementId} onCancel={h.onClose} onSaved={h.onSaved} cancelLabel={h.cancelLabel} />,
  "voice-capture": simple(VoiceCaptureConfigForm),
  "source-connect": simple(SourceConnectConfigForm),
  "send-connect": simple(SendConnectConfigForm),
  "daily-send": simple(DailySendConfigForm),
  // Whop Agent: one setup covers the connection, the save offer, alert
  // levels, the bridge and the webhook the workers need.
  "whop-connect": (h) => <WhopSetup engagementId={h.engagementId} onCancel={h.onClose} onSaved={h.onSaved} cancelLabel={h.cancelLabel} />,
  "whop-cancellation-save-offer": (h) => <WhopSetup engagementId={h.engagementId} onCancel={h.onClose} onSaved={h.onSaved} cancelLabel={h.cancelLabel} />,
  "whop-bridge-manager": (h) => <WhopSetup engagementId={h.engagementId} onCancel={h.onClose} onSaved={h.onSaved} cancelLabel={h.cancelLabel} />,
};

/** Workers with a self-loading config form. (Pile-On's small form takes
 * its current values from the page instead — see SkillConfigureMenu.) */
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
