"use client";

// src/components/product-setup/fact-token.tsx
//
// A word or phrase inside a setup sentence that opens a small editor. How it
// looks says how sure the app is (fact-trust.ts):
//   done   - plain bold text; it's settled, but still one click to change
//   likely - lavender "we think" highlight, the same accent the rest of the
//            app uses for what AI filled in
//   ask    - a dashed gap asking for the one thing we couldn't find

import { useState, type ReactNode } from "react";
import type { TrustTier } from "@/lib/fact-trust";
import { Button } from "@/components/ui/button";
import { AnchoredCard } from "./anchored-card";
import { cn } from "@/lib/utils";

export function FactToken({
  display,
  placeholder,
  tier,
  open,
  onOpenChange,
  title,
  source,
  width = 320,
  children,
}: {
  /** The value as it reads in the sentence; empty shows the placeholder. */
  display: string | null;
  placeholder: string;
  tier: TrustTier;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Heading inside the editor card. */
  title: string;
  /** Where the value came from, in plain words. */
  source?: string | null;
  width?: number;
  children: ReactNode;
}) {
  const empty = !display;
  const shownTier: TrustTier = empty ? "ask" : tier;

  return (
    <AnchoredCard
      open={open}
      onOpenChange={onOpenChange}
      label={title}
      width={width}
      anchor={(props) => (
        <button
          type="button"
          {...props}
          className={cn(
            "inline rounded-md -my-0.5 py-0.5 text-left align-baseline transition-colors cursor-pointer outline-none",
            "focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]",
            // Settled values sit flush in the sentence; highlighted ones get room.
            shownTier === "done" ? "px-1 -mx-1" : "px-1.5",
            shownTier === "done" && "font-semibold text-[var(--text-primary)] underline decoration-[var(--border)] decoration-1 underline-offset-[5px] hover:bg-[var(--accent-dim)] hover:decoration-[var(--text-muted)]",
            shownTier === "likely" &&
              "font-semibold text-[var(--text-prefill-accent)] bg-[var(--surface-prefill)] underline decoration-dotted decoration-[var(--border-prefill)] underline-offset-[5px] hover:decoration-[var(--text-prefill-accent)]",
            shownTier === "ask" &&
              "font-medium text-[var(--text-muted)] outline-1 outline-dashed outline-offset-[-1px] outline-[var(--text-muted)]/60 hover:text-[var(--text-primary)] hover:outline-[var(--text-primary)]",
            open && shownTier !== "ask" && "bg-[var(--accent-dim)]"
          )}
        >
          {empty ? placeholder : display}
        </button>
      )}
    >
      <div className="px-4 pt-3.5 pb-1">
        <p className="text-xs font-semibold text-[var(--text-muted)]">{title}</p>
        {source && (
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            {tier === "likely" && <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-prefill-accent)]" aria-hidden="true" />}
            <span>{source}</span>
          </p>
        )}
      </div>
      <div className="px-4 pt-2 pb-4">{children}</div>
    </AnchoredCard>
  );
}

/** A list of choices for a FactToken editor. */
export function ChoiceList<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: string | null;
  onPick: (value: T) => void;
}) {
  return (
    <ul className="-mx-2 max-h-72 overflow-y-auto">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <li key={o.value}>
            <button
              type="button"
              onClick={() => onPick(o.value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors cursor-pointer",
                active ? "bg-[var(--accent-dim)]" : "hover:bg-[var(--accent-dim)]"
              )}
            >
              <span
                className={cn(
                  "mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                  active ? "border-[var(--ink)] bg-[var(--ink)]" : "border-[var(--text-muted)]/50"
                )}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-foreground)]" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--text-primary)]">{o.label}</span>
                {o.hint && <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">{o.hint}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A free-text editor for a FactToken: Enter or Save applies it. */
export function TextEditor({
  initial,
  placeholder,
  multiline = false,
  onSave,
  saveLabel = "Save",
  footer,
}: {
  initial: string;
  placeholder?: string;
  multiline?: boolean;
  onSave: (value: string) => void;
  saveLabel?: string;
  footer?: ReactNode;
}) {
  const [value, setValue] = useState(initial);
  const field =
    "w-full rounded-lg border bg-background px-3 text-sm outline-none transition-shadow placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--ring)]/40";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value.trim());
      }}
      className="space-y-2.5"
    >
      {multiline ? (
        <textarea
          autoFocus
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={cn(field, "resize-none py-2 leading-relaxed")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSave(value.trim());
            }
          }}
        />
      ) : (
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className={cn(field, "h-10")} />
      )}
      {footer}
      <div className="flex justify-end">
        <Button type="submit" size="sm">
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}
