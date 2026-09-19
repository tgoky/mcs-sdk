"use client";

// Phase 3's "Inferred cards" (see the "Worker Onboarding & Gating: Plan"
// doc's Worker Dossier section): "here's what I already found" with a
// Confirm / Override choice, never a blank box that looks the same
// whether the value was detected or hand-typed. Deliberately a small,
// self-contained affordance rendered ABOVE an existing input, not a
// replacement for it — the input keeps working exactly as it did before
// for every caller that doesn't render this alongside it.
//
// Three states, not two, because a silent auto-fill (rep-onboarding's own
// `setForm(f => ({ ...f, operatorName: data.buyer }))`, icp-lock's
// equivalent) already exists and is left untouched here — removing it
// would be a behavior change with its own real risk. This badge adds
// transparency on top of that existing behavior instead of replacing it:
//   1. currentValue is empty, a detected value exists -> "Detected: X" +
//      a one-click "Use this" button.
//   2. currentValue already equals the detected value (the existing
//      eager pre-fill already ran) -> a quiet, button-less confirmation
//      note, so the field's origin is visible instead of looking
//      indistinguishable from something the user typed themselves.
//   3. currentValue is non-empty and different from the detected value
//      -> renders nothing. The user already made a real choice; don't
//      nag them back toward a guess.

export function InferredFieldBadge({
  detectedValue,
  currentValue,
  detectedFromLabel,
  onUse,
}: {
  /** The value this app can derive right now — omit/empty if nothing's
   * actually derivable yet, in which case this renders nothing (state 3
   * by default, no false "detected" claim). */
  detectedValue: string | undefined;
  /** The field's current live value, from the same state the input
   * itself reads/writes. */
  currentValue: string;
  /** Where the value came from, e.g. "the client's name on file" —
   * plugged into "Detected from {x}", not a generic claim. */
  detectedFromLabel: string;
  /** Only called from state 1's button — the parent already knows how
   * to update its own field state (the same setter the input uses). */
  onUse: (value: string) => void;
}) {
  if (!detectedValue?.trim()) return null;

  if (currentValue.trim() === detectedValue.trim()) {
    return (
      <p className="text-[10.5px] text-zinc-400 dark:text-zinc-600 -mt-1 mb-1.5">
        Pre-filled from {detectedFromLabel} — edit above if it's wrong.
      </p>
    );
  }

  if (currentValue.trim().length > 0) return null;

  return (
    <div className="flex items-center gap-2 -mt-1 mb-1.5 text-[11px]">
      <span className="text-zinc-500 dark:text-zinc-500">
        Detected from {detectedFromLabel}: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{detectedValue}</span>
      </span>
      <button
        type="button"
        onClick={() => onUse(detectedValue)}
        className="text-amber-600 dark:text-amber-400 font-semibold hover:underline cursor-pointer"
      >
        Use this
      </button>
    </div>
  );
}
