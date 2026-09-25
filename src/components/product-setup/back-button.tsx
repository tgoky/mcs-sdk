"use client";

// src/components/product-setup/back-button.tsx
//
// The way back, sized to sit on the same line as a self-headed setup's
// own mark and title rather than above them. setup-page-client.tsx skips
// rendering its own back button for a setup that carries its own heading
// (Showtime, Reputation Manager, Whop Agent, Cold Open) and hands the
// href to the setup instead, so every one of them renders this in its
// own header.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Back"
      title="Back"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100/80 text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      <ChevronLeft className="h-4 w-4" />
    </Link>
  );
}
