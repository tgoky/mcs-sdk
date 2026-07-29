"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Settings2, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { QuickActionResult } from "@/lib/quick-actions";

// =============================================================================
// ACTION PANEL
//
// The click-to-open "settings" panel used on Live Executions rows and Queue
// rows. Replaces the old hover-triggered preview (src/components/hover-
// preview.tsx, now removed) with an explicit trigger button, so nothing
// opens just because the mouse passed over a row. Visually it borrows the
// layout of a Linear-style popover — rounded card, uppercase section
// labels, icon + label rows, a thin divider between groups — repainted in
// this app's own popover/border/accent tokens so it matches light + dark
// mode instead of being hardcoded to one palette.
// =============================================================================

export interface ActionPanelItem {
  key: string;
  icon: LucideIcon;
  label: string;
  /** For mutations (cancel run, pause automations, copy id, ...). */
  onSelect?: () => void;
  /** For plain navigation (view run, open engagement, ...). Wins if both are set. */
  href?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
}

export interface ActionPanelSection {
  label?: string;
  items: ActionPanelItem[];
}

/**
 * Tracks which single action is in flight and the last error, so the panel
 * can show an inline spinner + error banner instead of a toast. Deliberately
 * local/per-panel state (not a global store) — each row's panel is a fresh
 * mount, so there's nothing to keep in sync across rows.
 */
export function useQuickActions() {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, action: () => Promise<QuickActionResult>, onSuccess?: () => void) => {
      setBusyKey(key);
      setError(null);
      const result = await action();
      setBusyKey(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess?.();
    },
    []
  );

  return { busyKey, error, run, dismissError: () => setError(null) };
}

function ActionPanelRow({ item, busy, onClose }: { item: ActionPanelItem; busy: boolean; onClose: () => void }) {
  const Icon = item.icon;
  const danger = item.tone === "danger";

  const className = cn(
    "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors cursor-pointer",
    "disabled:opacity-40 disabled:cursor-not-allowed",
    danger ? "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10" : "text-foreground hover:bg-accent/70"
  );

  const content = (
    <>
      {busy ? (
        <Loader2 size={15} className="shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Icon size={15} className={cn("shrink-0", !danger && "text-muted-foreground")} />
      )}
      <span className="flex-1 truncate font-medium">{item.label}</span>
    </>
  );

  if (item.href && !item.onSelect) {
    return (
      <Link href={item.href} onClick={onClose} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" disabled={item.disabled || busy} onClick={item.onSelect} className={className}>
      {content}
    </button>
  );
}

export function ActionPanel({
  open,
  onOpenChange,
  header,
  sections,
  footer,
  errorText,
  busyKey,
  side = "bottom",
  align = "end",
  triggerLabel = "Quick actions",
  triggerClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  header?: ReactNode;
  sections: ActionPanelSection[];
  footer?: ReactNode;
  errorText?: string | null;
  busyKey?: string | null;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center justify-center w-7 h-7 rounded-md border shrink-0 transition-colors cursor-pointer",
            open
              ? "border-border bg-accent text-foreground"
              : "border-transparent text-muted-foreground/70 hover:bg-accent hover:text-foreground hover:border-border",
            triggerClassName
          )}
        >
          <Settings2 size={14} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        onClick={(e) => e.stopPropagation()}
        className="w-[300px] p-0 rounded-2xl border border-border/70 bg-popover text-popover-foreground shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden"
      >
        {header && (
          <div className="px-4 pt-3.5 pb-3 border-b border-border/60 text-xs font-mono leading-normal">
            {header}
          </div>
        )}

        <div className="py-1.5 max-h-[360px] overflow-y-auto">
          {sections.map((section, i) => (
            <div key={section.label ?? i}>
              {section.label && (
                <p className="px-4 pt-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => (
                <ActionPanelRow
                  key={item.key}
                  item={item}
                  busy={busyKey === item.key}
                  onClose={() => onOpenChange(false)}
                />
              ))}
              {i < sections.length - 1 && <div className="my-1 border-t border-border/60" />}
            </div>
          ))}
        </div>

        {errorText && (
          <p className="px-4 py-2 border-t border-border/60 bg-rose-50 dark:bg-rose-950/30 text-[11px] font-mono text-rose-600 dark:text-rose-400">
            {errorText}
          </p>
        )}

        {footer && (
          <div className="px-4 py-2 border-t border-border/60 text-[10px] font-mono text-muted-foreground/70">
            {footer}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
