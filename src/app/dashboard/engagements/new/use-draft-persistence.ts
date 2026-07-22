import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  clearDraft,
  deleteServerDraft,
  fetchServerDraft,
  loadDraft,
  loadDraftStep,
  pushServerDraft,
  saveDraft,
} from "./draft-storage";
import { DEFAULT_FORM } from "./constants";
import type { FormData, Step } from "./types";

/**
 * Wires up draft persistence for the wizard: restores a previous
 * in-progress session on mount (sessionStorage first, falling back to the
 * server-side backup row), then keeps both in sync as the user edits the
 * form. Returns the "restored a draft" banner state and a way to discard
 * it and start fresh.
 */
export function useDraftPersistence(
  form: FormData,
  step: Step,
  setForm: Dispatch<SetStateAction<FormData>>,
  setStep: Dispatch<SetStateAction<Step>>
) {
  const [showRestoredBanner, setShowRestoredBanner] = useState(false);

  // Server-draft hydration guard: don't start pushing autosaves to the
  // server until we've first checked whether a draft from a previous,
  // now-closed session is sitting there — otherwise the very first render
  // (form still at DEFAULT_FORM) would race ahead and overwrite it with
  // blanks before we ever got a chance to read it back.
  const [hasHydratedServerDraft, setHasHydratedServerDraft] = useState(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function discardDraft() {
    clearDraft();
    deleteServerDraft();
    setForm(DEFAULT_FORM);
    setStep("offer");
    setShowRestoredBanner(false);
  }

  // Server-draft hydration: this tab's sessionStorage was empty, which
  // means either this is a genuinely fresh wizard, or the operator started
  // one in a tab/app/frame that's since closed. Check the server-side
  // backup before anything else touches `form`. Skipped entirely when
  // sessionStorage already had something, since that's always the
  // freshest copy for this tab.
  useEffect(() => {
    let cancelled = false;

    // 1. Synchronously check sessionStorage on client mount
    const localDraft = loadDraft();
    const localStep = loadDraftStep();

    if (localDraft || localStep) {
      if (localDraft) setForm(localDraft);
      if (localStep) setStep(localStep);
      setShowRestoredBanner(true);
      setHasHydratedServerDraft(true);
      return; // Skips fetchServerDraft()
    }

    // 2. Only runs if sessionStorage was completely empty
    (async () => {
      const serverDraft = await fetchServerDraft();
      if (!cancelled && serverDraft) {
        setForm((f) => ({ ...f, ...serverDraft.formData }));
        setStep(serverDraft.step);
        setShowRestoredBanner(true);
      }
      if (!cancelled) setHasHydratedServerDraft(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draft autosave: keeps onboarding progress across an accidental refresh
  // or back/forward navigation. API keys are stripped before storage inside
  // saveDraft, so nothing sensitive ends up in sessionStorage. The
  // sessionStorage write is synchronous and instant; the server push is
  // debounced 1.5s behind it — sessionStorage is the fast path for a
  // same-tab reload, the server row is the fallback for when the tab/app
  // itself closes and sessionStorage is gone before it can help.
  useEffect(() => {
    saveDraft(form, step);
    if (!hasHydratedServerDraft) return;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      pushServerDraft(form, step);
    }, 1500);
    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, step, hasHydratedServerDraft]);

  // Narrow safety net for the ~1.5s window between an edit and the
  // debounced server push actually firing — sessionStorage already has
  // this tab's copy instantly, so this only matters if the tab/app closes
  // in that specific gap.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (pushTimerRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return { showRestoredBanner, setShowRestoredBanner, discardDraft };
}
