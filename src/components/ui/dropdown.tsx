"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownItem<T extends string = string> {
  key: T;
  label: string;
  description?: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

interface DropdownProps<T extends string> {
  items: DropdownItem<T>[];
  selectedKey?: T | null;
  onSelect: (key: T) => void;
  /** "field" = chevron + current-value pill (mode/view pickers). "icon" = bare icon-only trigger (inline add/create actions). */
  variant?: "field" | "icon";
  /** Only used by variant="field". */
  label?: ReactNode;
  placeholder?: string;
  /** Only used by variant="icon". */
  icon?: LucideIcon;
  triggerTitle?: string;
  align?: "left" | "right";
  panelClassName?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export function Dropdown<T extends string>({
  items,
  selectedKey,
  onSelect,
  variant = "field",
  label,
  placeholder = "Select…",
  icon: TriggerIcon = Plus,
  triggerTitle,
  align = "left",
  panelClassName,
  triggerClassName,
  disabled,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.key === selectedKey);

  return (
    <div className="relative">
      {variant === "icon" ? (
        <button
          type="button"
          title={triggerTitle}
          disabled={disabled}
          onClick={() => setOpen((p) => !p)}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors cursor-pointer hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
            open && "bg-zinc-800 text-white",
            triggerClassName
          )}
        >
          <TriggerIcon size={13} />
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((p) => !p)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors cursor-pointer hover:bg-zinc-800/80 disabled:cursor-not-allowed disabled:opacity-40",
            open && "border-zinc-700 bg-zinc-800/80",
            triggerClassName
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {label && <span className="shrink-0 text-zinc-500">{label}</span>}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronDown size={13} className="shrink-0 text-zinc-500" />
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "absolute top-full z-50 mt-1 min-w-[200px] space-y-0.5 rounded-xl border border-zinc-800 bg-zinc-900 p-1 text-xs shadow-xl",
              align === "right" ? "right-0" : "left-0",
              panelClassName
            )}
          >
            {items.map((item) => {
              const ItemIcon = item.icon;
              const active = item.key === selectedKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    onSelect(item.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                    active
                      ? "bg-zinc-800 font-semibold text-white"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {ItemIcon && <ItemIcon size={13} className="shrink-0 text-zinc-500" />}
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      {item.description && (
                        <span className="block truncate text-[10px] font-normal text-zinc-500">{item.description}</span>
                      )}
                    </span>
                  </span>
                  {active && <Check size={12} className="shrink-0 text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
