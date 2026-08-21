"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function EnterDashboardBtn({
  href = "/dashboard",
  children = "Enter Dashboard",
  onNavigateStart,
}: {
  href?: string;
  children?: React.ReactNode;
  onNavigateStart?: () => void;
}) {
  const router = useRouter();
  const clickedRef = useRef(false);
  const [pending, setPending] = useState(false);

  // Prefetch destination so router.push resolves near-instantly
  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (clickedRef.current) return;
    clickedRef.current = true;
    setPending(true);

    // Kick off the exit animation immediately
    if (onNavigateStart) onNavigateStart();

    // Navigate after a short delay so the animation is visibly underway
    // and the page swap arrives right as it completes
    setTimeout(() => {
      router.push(href);
    }, 400);
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={
        "relative group w-full sm:w-auto sm:min-w-[280px] h-12 px-16 " +
        "bg-white text-black text-sm font-semibold rounded-none " +
        "flex items-center justify-center " +
        "transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] " +
        "hover:scale-[1.02] active:scale-[0.97] hover:bg-zinc-100 " +
        "overflow-hidden cursor-pointer " +
        (pending ? "pointer-events-none opacity-70" : "")
      }
    >
      <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
      <span>{children}</span>
    </button>
  );
}