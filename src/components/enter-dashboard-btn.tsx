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

  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (clickedRef.current) return;
    clickedRef.current = true;
    setPending(true);

    if (onNavigateStart) onNavigateStart();

    setTimeout(() => {
      router.push(href);
    }, 380);
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
        "overflow-hidden " +
        (pending ? "pointer-events-none" : "cursor-pointer")
      }
    >
      <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />

      {pending ? (
        <span className="flex items-center gap-2.5 text-zinc-500">
          <svg
            className="animate-spin h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-80"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Entering…
        </span>
      ) : (
        <span>{children}</span>
      )}
    </button>
  );
}