"use client";

// src/components/product-setup/review-kit.tsx
//
// The pieces every product's setup review is built from, so they all read
// the same way: a card with the thing at a glance, "What we did" (one row
// per finding, where it came from, Change in a small anchored editor, Undo
// to put back what we found, or chips to switch in place), "Left to do",
// and one Approve.

import { useState, type ReactNode } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { AnchoredCard } from "./anchored-card";
import { cn } from "@/lib/utils";

export interface FeedEntry {
  key: string;
  text: ReactNode;
  source?: string;
  /** Opens a small editor anchored to Change. */
  editor?: (close: () => void) => ReactNode;
  editLabel?: string;
  /** Puts back what we found, once changed. */
  undo?: () => void;
  action?: { label: string; onClick: () => void };
  todo?: boolean;
  warn?: boolean;
  /** Shown under the text, e.g. chips to switch in place. */
  body?: ReactNode;
}

export function FeedRow({ entry: e }: { entry: FeedEntry }) {
  return (
    <li className="group flex items-start gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          e.warn ? "bg-[var(--error)] text-white" : e.todo ? "ring-1 ring-inset ring-dashed ring-[var(--text-prefill-accent)]" : "bg-[var(--surface-prefill)] text-[var(--text-prefill-accent)]",
        )}
      >
        {e.warn ? <AlertTriangle className="h-3 w-3" strokeWidth={3} /> : e.todo ? null : <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] [&_b]:font-semibold [&_b]:text-[var(--text-primary)]">{e.text}</p>
        {e.source && <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{e.source}</p>}
        {e.body && <div className="mt-2.5">{e.body}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-3 pt-0.5 text-[13px]">
        {e.undo && (
          <button type="button" onClick={e.undo} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            Undo
          </button>
        )}
        {e.editor && (
          <Popover label={e.editLabel ?? "Change"} title={e.editLabel ?? "Change"} strong={e.todo}>
            {e.editor}
          </Popover>
        )}
        {e.action && (
          <button type="button" onClick={e.action.onClick} className="font-medium text-[var(--text-primary)] underline underline-offset-4 cursor-pointer">
            {e.action.label}
          </button>
        )}
      </div>
    </li>
  );
}

/** A small link that opens its editor in a card anchored to it. */
export function Popover({ label, title, strong, children }: { label: string; title: string; strong?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AnchoredCard
      open={open}
      onOpenChange={setOpen}
      label={title}
      width={380}
      placement="bottom-end"
      anchor={(props) => (
        <button
          type="button"
          {...props}
          className={cn("text-[13px] cursor-pointer", strong ? "font-medium text-[var(--text-primary)] underline underline-offset-4" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
        >
          {label}
        </button>
      )}
    >
      <div className="p-4">{children(() => setOpen(false))}</div>
    </AnchoredCard>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: "on" | "off" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 ring-1 ring-inset",
        tone === "on"
          ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
          : tone === "off"
            ? "bg-[var(--surface-prefill)] text-[var(--text-prefill-accent)] ring-transparent"
            : "text-[var(--text-secondary)] ring-black/10 dark:ring-white/10",
      )}
    >
      {children}
    </span>
  );
}

export const inputCls = "w-full rounded-lg border bg-background px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--ring)]/40";

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function ToggleList({ items, onToggle }: { items: { label: string; hint?: string; on: boolean }[]; onToggle: (i: number) => void }) {
  return (
    <ul className="-mx-1 max-h-72 space-y-0.5 overflow-y-auto">
      {items.map((it, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onToggle(i)}
            className={cn("flex w-full items-start gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-[var(--accent-dim)] cursor-pointer", !it.on && "opacity-50")}
          >
            <Tick on={it.on} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-[var(--text-primary)]">{it.label}</span>
              {it.hint && <span className="block text-[12px] text-[var(--text-muted)]">{it.hint}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Tick({ on }: { on: boolean }) {
  return (
    <span className={cn("mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border", on ? "border-[var(--ink)] bg-[var(--ink)]" : "border-[var(--text-muted)]")}>
      {on && <Check className="h-3 w-3 text-[var(--ink-foreground)]" strokeWidth={3} />}
    </span>
  );
}

/** The thing being set up, at a glance. */
export function ReviewCard({
  mark,
  eyebrow,
  title,
  pills,
  children,
  leading,
}: {
  mark: ReactNode;
  eyebrow: string;
  title: ReactNode;
  pills?: ReactNode;
  children?: ReactNode;
  /** The back chevron, when the caller renders one — sits inline with the
   * mark and title so the header reads as one line, not two. */
  leading?: ReactNode;
}) {
  return (
    <header className="px-1 @xl:px-0">
      <div className="flex items-start gap-4">
        {leading}
        {mark}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{eyebrow}</p>
          <h1 className="mt-1 text-[22px] font-semibold leading-snug tracking-tight text-[var(--text-primary)] @xl:text-[26px]">{title}</h1>
          {pills && <div className="mt-3 flex flex-wrap gap-2 text-[12px]">{pills}</div>}
        </div>
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

/** "What we did": one row per finding. */
export function Feed({ entries, onReread, title = "What we did" }: { entries: FeedEntry[]; onReread?: () => void; title?: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 px-1">
        <h2 className="text-[13px] font-medium text-[var(--text-secondary)]">{title}</h2>
        {onReread && (
          <button type="button" onClick={onReread} className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            Read again
          </button>
        )}
      </div>
      <ol className="space-y-1">
        {entries.map((e) => (
          <FeedRow key={e.key} entry={e} />
        ))}
      </ol>
    </section>
  );
}

export interface TodoItem {
  key: string;
  label: ReactNode;
  done: boolean;
  /** Optional steps say so and don't hold up Approve. */
  optional?: boolean;
  action?: ReactNode;
}

/** "Left to do": what still stands between this and running. */
export function Todos({ items }: { items: TodoItem[] }) {
  if (items.length === 0) return null;
  const ready = items.every((t) => t.done);
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[13px] font-medium text-[var(--text-secondary)]">{ready ? "Ready" : "Left to do"}</h2>
      <ul className="px-1 divide-y divide-[var(--border)]">
        {items.map((t) => (
          <li key={t.key} className="flex items-center gap-3 py-3">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                t.done ? "bg-[var(--ink)] text-[var(--ink-foreground)]" : "ring-1 ring-inset ring-[var(--text-muted)]/50",
              )}
            >
              {t.done && <Check className="h-3 w-3" strokeWidth={3.5} />}
            </span>
            <span className={cn("min-w-0 flex-1 text-[14px]", t.done ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]")}>
              {t.label}
              {t.optional && !t.done && <span className="ml-1.5 text-[12px] text-[var(--text-muted)]">Optional</span>}
            </span>
            {t.action}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Chips to switch on and off in place. Off ones stay, struck through. */
export function ChipRow({
  items,
  onToggle,
  onAdd,
  addLabel = "Add",
}: {
  items: {
    value: string;
    on: boolean;
    hint?: string;
    guess?: boolean;
    star?: { on: boolean; onToggle: () => void };
  }[];
  onToggle: (i: number) => void;
  onAdd?: (value: string) => void;
  addLabel?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const submit = () => {
    const v = draft.trim();
    if (v && onAdd) onAdd(v);
    setDraft("");
    setAdding(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it, i) => (
        <span
          key={`${it.value}-${i}`}
          title={it.hint}
          className={cn(
            "inline-flex max-w-full items-center overflow-hidden rounded-full border text-[13px] transition-colors",
            it.on ? (it.guess ? "border-transparent bg-[var(--surface-prefill)] text-[var(--text-primary)]" : "text-[var(--text-primary)]") : "border-dashed text-[var(--text-muted)]",
          )}
        >
          {it.star && (
            <button type="button" aria-label={it.star.on ? "Unstar" : "Star"} onClick={it.star.onToggle} className="pl-2 cursor-pointer">
              <span className={cn("text-[12px]", it.star.on ? "" : "opacity-40")}>{it.star.on ? "★" : "☆"}</span>
            </button>
          )}
          <button type="button" onClick={() => onToggle(i)} className={cn("truncate px-2.5 py-0.5 cursor-pointer", !it.on && "line-through")}>
            {it.value}
          </button>
        </span>
      ))}
      {onAdd &&
        (adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            onBlur={submit}
            placeholder={addLabel}
            className="h-7 w-44 rounded-full border px-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--ring)]/40"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed px-2.5 py-0.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            + {addLabel}
          </button>
        ))}
    </div>
  );
}

/** The one Approve bar every review ends with. */
export function ApproveBar({
  note,
  error,
  saving,
  disabled,
  onApprove,
  onCancel,
  cancelLabel,
  label = "Approve",
}: {
  note?: ReactNode;
  error?: string | null;
  saving: boolean;
  disabled?: boolean;
  onApprove: () => void;
  onCancel: () => void;
  cancelLabel: string;
  label?: string;
}) {
  return (
    <div className="sticky bottom-0 z-20 mt-8 bg-background/90 px-4 py-3 backdrop-blur-md shadow-[0_-12px_24px_-18px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-2.5 @3xl:flex-row @3xl:items-center @3xl:gap-4">
        <div className="min-w-0 flex-1 text-sm">
          {error ? (
            <p className="flex items-center gap-2 text-[var(--error)]">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </p>
          ) : note ? (
            <p className="text-[var(--text-secondary)]">{note}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="hidden h-9 px-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer @md:inline">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={saving || disabled}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--ink)] px-5 text-sm font-medium text-[var(--ink-foreground)] transition-opacity disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The top of one skill's own settings: which skill, whose, and the way to
 * the product's full setup. */
export function SettingsHeader({
  mark,
  name,
  buyer,
  fullSetupHref,
  leading,
}: {
  mark: ReactNode;
  name: string;
  buyer: string;
  fullSetupHref?: string;
  /** The back chevron, when the caller renders one — sits inline with the
   * mark and title so the header reads as one line, not two. */
  leading?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 px-1">
      {leading}
      {mark}
      <div className="min-w-0 flex-1">
        <h1 className="text-[17px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">{name}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Settings for {buyer}</p>
      </div>
      {fullSetupHref && (
        <a href={fullSetupHref} className="shrink-0 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          Full setup
        </a>
      )}
    </header>
  );
}

/** Keeps the rows one skill owns, in the review's order. A key ending in
 * "-" matches every row that starts with it (one row per group, domain...). */
export function pick<T extends { key: string }>(rows: T[], keys: readonly string[] | undefined): T[] {
  if (!keys) return rows;
  return rows.filter((r) => keys.some((k) => (k.endsWith("-") ? r.key.startsWith(k) : r.key === k)));
}
