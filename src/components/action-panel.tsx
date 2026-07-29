"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Settings2, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { QuickActionResult } from "@/lib/quick-actions";

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
    danger 
      ? "text-rose-400 hover:bg-rose-500/15" 
      : "text-zinc-200 hover:bg-zinc-800/80"
  );

  const content = (
    <>
      {busy ? (
        <Loader2 size={15} className="shrink-0 animate-spin text-zinc-400" />
      ) : (
        <Icon size={15} className={cn("shrink-0", !danger && "text-zinc-400")} />
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
              ? "border-zinc-700 bg-zinc-800 text-zinc-100"
              : "border-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100 hover:border-zinc-700",
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
        className="w-[300px] p-0 rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl shadow-black/80 overflow-hidden"
      >
        {header && (
          <div className="px-4 pt-3.5 pb-3 border-b border-zinc-800/80 text-xs font-mono leading-normal text-zinc-300">
            {header}
          </div>
        )}

        <div className="py-1.5 max-h-[360px] overflow-y-auto">
          {sections.map((section, i) => (
            <div key={section.label ?? i}>
              {section.label && (
                <p className="px-4 pt-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
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
              {i < sections.length - 1 && <div className="my-1 border-t border-zinc-800/80" />}
            </div>
          ))}
        </div>

        {errorText && (
          <p className="px-4 py-2 border-t border-zinc-800/80 bg-rose-950/40 text-[11px] font-mono text-rose-400">
            {errorText}
          </p>
        )}

        {footer && (
          <div className="px-4 py-2 border-t border-zinc-800/80 text-[10px] font-mono text-zinc-400">
            {footer}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}