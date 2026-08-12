"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { KeyRound, Webhook } from "lucide-react";

type Tab = "credentials" | "booking-sync";

const TABS: { id: Tab; label: string; icon: typeof KeyRound }[] = [
  { id: "credentials", label: "Credentials", icon: KeyRound },
  { id: "booking-sync", label: "Booking Sync", icon: Webhook },
];

/**
 * Both panels are rendered server-side up front and passed in as already-
 * built React nodes — this shell only ever toggles which one is visible.
 * Nothing here re-fetches on tab switch, so clicking between Credentials
 * and Booking Sync is instant instead of round-tripping the DB queries
 * both panels' server components already ran once on page load.
 */
export function SettingsShell({
  credentialsPanel,
  bookingSyncPanel,
}: {
  credentialsPanel: ReactNode;
  bookingSyncPanel: ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initial = searchParams.get("tab") === "booking-sync" ? "booking-sync" : "credentials";
  const [tab, setTab] = useState<Tab>(initial);

  function selectTab(next: Tab) {
    setTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-900">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-ink text-zinc-900 dark:text-zinc-100"
                : "border-transparent text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div>{tab === "credentials" ? credentialsPanel : bookingSyncPanel}</div>
    </div>
  );
}
