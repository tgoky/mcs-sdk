"use client";

import { useState } from "react";

interface NavLink {
  href: string;
  label: string;
}

export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex flex-col justify-center items-center w-8 h-8 space-y-1 text-zinc-400 hover:text-zinc-200"
        aria-label="Toggle menu"
      >
        <span
          className={`block h-px w-5 bg-current transition-transform duration-200 ${
            open ? "rotate-45 translate-y-1.5" : ""
          }`}
        />
        <span
          className={`block h-px w-5 bg-current transition-opacity duration-200 ${
            open ? "opacity-0" : ""
          }`}
        />
        <span
          className={`block h-px w-5 bg-current transition-transform duration-200 ${
            open ? "-rotate-45 -translate-y-1.5" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setOpen(false)}
          />
          {/* Menu panel */}
          <div className="fixed top-14 left-0 right-0 z-50 bg-zinc-950 border-b border-zinc-900 py-3 px-4 space-y-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm font-medium rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
