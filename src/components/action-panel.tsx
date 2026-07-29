"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Settings2, ExternalLink, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { QuickActionResult } from "@/lib/quick-actions";

export interface ActionPanelItem {
  key: string;
  icon?: LucideIcon;
  label: string;
  description?: string;
  /** Highlights item like "Introducing initiatives" in the Raycast style */
  active?: boolean;
  /** Renders external link icon on the right */
  external?: boolean;
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
    "group w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-sans font-medium text-left transition-all duration-100 select-none cursor-pointer active:scale-[0.98]",
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
    item.active
      ? "bg-white/12 text-white shadow-xs border border-white/10"
      : danger
      ? "text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
      : "text-zinc-200 hover:bg-white/10 hover:text-white"
  );

  const content = (
    <>
      {busy ? (
        <Loader2 size={16} className="shrink-0 animate-spin text-zinc-400" />
      ) : Icon ? (
        <Icon size={16} className={cn("shrink-0 transition-colors", danger ? "text-rose-400" : "text-zinc-300 group-hover:text-white")} />
      ) : null}

      <div className="flex-1 min-w-0">
        <span className="block truncate leading-snug">{item.label}</span>
        {item.description && (
          <span className="block text-[11px] text-zinc-400 font-sans font-normal leading-normal truncate opacity-80">
            {item.description}
          </span>
        )}
      </div>

      {item.external && (
        <ExternalLink size={14} className="shrink-0 text-zinc-400/70 group-hover:text-white transition-colors" />
      )}
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
            "inline-flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 transition-all duration-150 cursor-pointer active:scale-95",
            open
              ? "border-white/20 bg-white/12 text-white shadow-xs"
              : "border-transparent text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 hover:border-white/10",
            triggerClassName
          )}
        >
          <Settings2 size={14} />
        </button>
      </PopoverTrigger>

      {/* Raycast/Linear Frosted Dark Glass Surface */}
      <PopoverContent
        side={side}
        align={align}
        onClick={(e) => e.stopPropagation()}
        className="w-[280px] sm:w-[300px] p-2 rounded-[20px] border border-white/15 bg-gradient-to-b from-[#2b2b2f]/95 via-[#212124]/95 to-[#1a1a1d]/95 backdrop-blur-2xl text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_20px_50px_rgba(0,0,0,0.7)] overflow-hidden font-sans tracking-tight antialiased"
      >
        {header && (
          <div className="px-3 pt-2 pb-2.5 mb-1 border-b border-white/10 text-xs font-sans leading-normal text-zinc-300">
            {header}
          </div>
        )}

        <div className="py-0.5 space-y-1 max-h-[380px] overflow-y-auto">
          {sections.map((section, i) => (
            <div key={section.label ?? i} className="space-y-0.5">
              {section.label && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-sans font-bold uppercase tracking-wider text-zinc-400/90 select-none">
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
              {i < sections.length - 1 && <div className="my-1.5 border-t border-white/10" />}
            </div>
          ))}
        </div>

        {errorText && (
          <p className="px-3 py-2 mt-1 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] font-sans text-rose-300">
            {errorText}
          </p>
        )}

        {footer && (
          <div className="px-3 py-2 border-t border-white/10 text-[10px] font-sans text-zinc-400">
            {footer}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}