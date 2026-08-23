"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Same click/prefetch/delayed-navigate shape as EnterDashboardBtn, sized
 * for a spot in the header row instead of the hero — this is the signup-
 * flavored CTA (see src/app/page.tsx's getStartedHref), so it stays small
 * and separate from the sign-in-flavored "Enter Dashboard" button rather
 * than sharing one ambiguous button for both intents.
 */
export function HeaderCtaBtn({
  href,
  children = "Get Started",
  onNavigateStart,
}: {
  href: string;
  children?: React.ReactNode;
  onNavigateStart?: () => void;
}) {
  const router = useRouter();
  const clickedRef = useRef(false);

  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (clickedRef.current) return;
    clickedRef.current = true;

    if (onNavigateStart) onNavigateStart();

    setTimeout(() => {
      router.push(href);
    }, 380);
  };

  return (
    <button
      onClick={handleClick}
      className="shrink-0 h-9 px-5 rounded-full border border-white/25 bg-white/10 backdrop-blur-md text-xs sm:text-sm font-semibold text-white transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white hover:text-black hover:border-white active:scale-[0.97] cursor-pointer"
    >
      {children}
    </button>
  );
}
