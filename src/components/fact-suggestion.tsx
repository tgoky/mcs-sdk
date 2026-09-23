"use client";

// A suggestion the app found for a field but isn't sure enough to fill in
// on its own (see src/lib/fact-suggestions.ts): shown beside the field with
// where it came from and how confident the score was, never as if it were
// the answer. "Use" copies it into the field (the dossier's save records
// that as confirmed or edited); "Not right" records a rejection right away
// so the same value isn't suggested again.

import { useState } from "react";

export interface FactSuggestionDTO {
  value: unknown;
  source: string;
  sourceDetail: string | null;
  confidence: number | null;
  evidence: string | null;
  derived?: boolean;
  label?: string;
}

export function suggestionSourceLabel(s: FactSuggestionDTO): string {
  if (s.label) return s.label;
  if (s.source === "account") return s.sourceDetail ? `your ${s.sourceDetail.replace(/_/g, " ")} account` : "a connected account";
  if (s.source === "jev" || s.source === "llm" || s.source === "website") return "your website";
  if (s.source === "user") return "an earlier answer";
  return "what's on file";
}

function confidenceNote(s: FactSuggestionDTO): string {
  if (s.confidence !== null) return ` (${s.confidence}% confident)`;
  // Rule-based suggestions and account data aren't guesses — no score to show.
  if (s.derived || s.source === "account") return "";
  return " (not scored yet)";
}

async function rejectFact(engagementId: string, factKey: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/engagements/${engagementId}/facts/${encodeURIComponent(factKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    // 404: nothing stored to reject (a suggestion derived from what's
    // connected, not a stored fact) — hiding it is all there is to do.
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export function FactSuggestionChip({
  engagementId,
  factKey,
  suggestion,
  currentValue,
  display = (v) => (typeof v === "string" ? v : JSON.stringify(v)),
  onUse,
}: {
  engagementId: string;
  factKey: string;
  suggestion: FactSuggestionDTO | undefined;
  /** The field's live value, compared against the suggestion's display text. */
  currentValue: string;
  display?: (value: unknown) => string;
  onUse: (value: unknown) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!suggestion || dismissed) return null;
  const shown = display(suggestion.value);
  if (!shown.trim() || currentValue.trim() === shown.trim()) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" title={suggestion.evidence ?? undefined}>
      <span className="text-zinc-400">
        Suggested from {suggestionSourceLabel(suggestion)}{confidenceNote(suggestion)}:{" "}
        <span className="font-semibold text-zinc-200">{shown}</span>
      </span>
      <button type="button" onClick={() => onUse(suggestion.value)} className="font-semibold text-amber-400 hover:underline cursor-pointer">
        Use
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          if (await rejectFact(engagementId, factKey)) setDismissed(true);
          setBusy(false);
        }}
        className="text-zinc-500 hover:text-zinc-300 hover:underline cursor-pointer disabled:opacity-50"
      >
        Not right
      </button>
    </div>
  );
}

/** For list fields (competitors, entities, ICPs): each suggested item can be
 * added on its own; "None of these" rejects the whole suggested list. */
export function FactSuggestionList({
  engagementId,
  factKey,
  suggestion,
  currentItems,
  itemLabel = (v) => (typeof v === "string" ? v : String((v as { label?: string; name?: string })?.label ?? (v as { name?: string })?.name ?? "")),
  onAdd,
  prompt = "add the ones that are right",
}: {
  engagementId: string;
  factKey: string;
  suggestion: FactSuggestionDTO | undefined;
  currentItems: string[];
  itemLabel?: (item: unknown) => string;
  onAdd: (item: unknown) => void;
  /** What the user is being asked to do with the items. */
  prompt?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!suggestion || dismissed || !Array.isArray(suggestion.value)) return null;
  const have = new Set(currentItems.map((i) => i.trim().toLowerCase()));
  const remaining = (suggestion.value as unknown[]).filter((item) => {
    const label = itemLabel(item).trim();
    return label && !have.has(label.toLowerCase());
  });
  if (remaining.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-1 text-[11px]" title={suggestion.evidence ?? undefined}>
      <div className="text-zinc-400">
        Suggested from {suggestionSourceLabel(suggestion)}{confidenceNote(suggestion)} · {prompt}:
      </div>
      <div className="flex flex-wrap gap-1.5">
        {remaining.map((item) => (
          <button
            key={itemLabel(item)}
            type="button"
            onClick={() => onAdd(item)}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-200 hover:border-amber-500 hover:text-amber-300 cursor-pointer"
          >
            + {itemLabel(item)}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (await rejectFact(engagementId, factKey)) setDismissed(true);
            setBusy(false);
          }}
          className="px-1 text-zinc-500 hover:text-zinc-300 hover:underline cursor-pointer disabled:opacity-50"
        >
          None of these
        </button>
      </div>
    </div>
  );
}
