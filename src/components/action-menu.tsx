"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 300;
const EST_PANEL_HEIGHT = 340;
const VIEWPORT_MARGIN = 8;

export function ActionMenu({
  trigger,
  children,
  align = "end",
  panelWidth = PANEL_WIDTH,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  panelWidth?: number;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; flipped: boolean } | null>(null);

  function toggle() {
    setOpen((o) => !o);
  }
  function close() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const spaceBelow = window.innerHeight - rect.bottom;
    const flipped = spaceBelow < EST_PANEL_HEIGHT && rect.top > EST_PANEL_HEIGHT;
    const top = flipped ? rect.top - VIEWPORT_MARGIN : rect.bottom + 6;

    let left = align === "end" ? rect.right - panelWidth : rect.left;
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - panelWidth - VIEWPORT_MARGIN);

    setCoords({ top, left, flipped });
  }, [open, align, panelWidth]);

  useEffect(() => {
    if (!open) return;

    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onScrollOrResize() {
      close();
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <div ref={anchorRef} className="inline-flex">
      {trigger({ open, toggle })}
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: coords.flipped ? undefined : coords.top,
              bottom: coords.flipped ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: panelWidth,
              zIndex: 9999,
            }}
            className={`motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 ${
              coords.flipped ? "motion-safe:origin-bottom-right" : "motion-safe:origin-top-right"
            }`}
          >
            {/* Raycast/Linear Frosted Dark Glass Container */}
            <div
              ref={panelRef}
              role="menu"
              className="rounded-[20px] border border-white/15 bg-gradient-to-b from-[#2b2b2f]/95 via-[#212124]/95 to-[#1a1a1d]/95 backdrop-blur-2xl text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_20px_50px_rgba(0,0,0,0.7)] p-2 max-h-[70vh] overflow-y-auto font-sans tracking-tight antialiased space-y-0.5"
            >
              {typeof children === "function" ? children(close) : children}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export function ActionMenuSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      {label && (
        <p className="px-3 pt-2 pb-1 text-[10px] font-sans font-bold text-zinc-400/90 uppercase tracking-wider truncate select-none">
          {label}
        </p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function ActionMenuDivider() {
  return <div className="my-1.5 border-t border-white/10" />;
}

export function ActionMenuItem({
  icon: Icon,
  label,
  description,
  active = false,
  external = false,
  onClick,
  href,
  tone = "default",
  disabled = false,
  trailing,
}: {
  icon?: LucideIcon;
  label: string;
  description?: string;
  active?: boolean;
  external?: boolean;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger" | "accent";
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  const toneClass = active
    ? "bg-white/12 text-white shadow-xs border border-white/10"
    : tone === "danger"
    ? "text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
    : tone === "accent"
    ? "text-amber-400 hover:bg-amber-400/15 hover:text-amber-300"
    : "text-zinc-200 hover:bg-white/10 hover:text-white";

  const iconClass =
    tone === "danger"
      ? "text-rose-400"
      : tone === "accent"
      ? "text-amber-400"
      : "text-zinc-300 group-hover:text-white";

  const content = (
    <>
      {Icon && <Icon className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${iconClass}`} />}
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-sans font-medium leading-snug">{label}</span>
        {description && (
          <span className="block text-[11px] font-sans font-normal text-zinc-400/80 leading-normal mt-0.5">
            {description}
          </span>
        )}
      </span>
      {external && (
        <ExternalLink size={14} className="shrink-0 text-zinc-400/70 group-hover:text-white transition-colors" />
      )}
      {trailing}
    </>
  );

  const cls = cn(
    "group w-full flex items-start gap-3 px-3 py-2 rounded-xl text-left transition-all duration-100 select-none cursor-pointer active:scale-[0.98]",
    disabled ? "opacity-40 cursor-not-allowed active:scale-100" : toneClass
  );

  if (href && !disabled) {
    return (
      <a href={href} className={cls} role="menuitem">
        {content}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={cls} role="menuitem" type="button">
      {content}
    </button>
  );
}