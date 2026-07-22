import { stripDraftSecrets } from "@/lib/draft-fields";
import { DEFAULT_FORM, DRAFT_KEY, DRAFT_STEP_KEY, STEPS } from "./constants";
import type { FormData, Step } from "./types";

export function loadDraft(): FormData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Merge onto DEFAULT_FORM shape so a draft saved before a schema change
    // (new field added/removed) can't leave the form in a half-shaped state.
    return { ...DEFAULT_FORM, ...parsed };
  } catch {
    return null;
  }
}

export function loadDraftStep(): Step | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STEP_KEY);
    return raw && STEPS.some((s) => s.id === raw) ? (raw as Step) : null;
  } catch {
    return null;
  }
}

export function saveDraft(form: FormData, step: Step) {
  if (typeof window === "undefined") return;
  try {
    const { bookingApiKey, emailApiKey, hostingApiKey, smsApiKey, adDataApiKey, videoEngagementApiKey, apolloApiKey, pdlApiKey, ...safeToStore } = form;
    void bookingApiKey;
    void emailApiKey;
    void hostingApiKey;
    void smsApiKey;
    void adDataApiKey;
    void videoEngagementApiKey;
    void apolloApiKey;
    void pdlApiKey;
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(safeToStore));
    window.sessionStorage.setItem(DRAFT_STEP_KEY, step);
  } catch {
    // sessionStorage can throw in private-browsing/quota-exceeded edge
    // cases — losing draft persistence isn't worth surfacing an error over.
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
    window.sessionStorage.removeItem(DRAFT_STEP_KEY);
  } catch {
    // no-op
  }
}

// ── Server-side draft backup ────────────────────────────────────────────
// sessionStorage above only survives a same-tab refresh — it's wiped the
// instant the tab/app/embedded frame closes, with no warning. These three
// calls back that up with a real database row (see
// src/app/api/engagements/draft/route.ts) so closing out mid-wizard and
// coming back later still has something to restore. Fire-and-forget by
// design: a failed background sync shouldn't interrupt someone filling out
// a form, and sessionStorage still covers the common same-tab case even if
// these calls never landed.

export async function fetchServerDraft(): Promise<{ step: Step; formData: Partial<FormData> } | null> {
  try {
    const res = await fetch("/api/engagements/draft");
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.draft) return null;
    const step: Step = STEPS.some((s) => s.id === data.draft.step)
      ? data.draft.step
      : "offer";
    return { step, formData: data.draft.formData ?? {} };
  } catch {
    return null;
  }
}

export function pushServerDraft(form: FormData, step: Step) {
  const safeToStore = stripDraftSecrets(form);
  fetch("/api/engagements/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, formData: safeToStore }),
  }).catch(() => {
    // Best-effort — sessionStorage already has this tab's copy.
  });
}

export function deleteServerDraft() {
  fetch("/api/engagements/draft", { method: "DELETE" }).catch(() => {
    // Best-effort cleanup — an orphaned draft row just gets overwritten
    // by the next wizard session for this user, so a failure here is
    // harmless, not a stuck state.
  });
}
