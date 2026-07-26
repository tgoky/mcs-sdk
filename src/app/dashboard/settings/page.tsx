import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SettingsShell } from "./settings-shell";
import { CredentialsPanel } from "./credentials-panel";
import { BookingSyncPanel } from "./booking-sync-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Settings used to be a single-purpose "Credentials" page. This is now the
 * home for anything account-level: Credentials (moved here as-is, just
 * renamed to a panel component — see credentials-panel.tsx) plus the new
 * Booking Sync tab, which surfaces the per-engagement status card also
 * shown on the engagement detail page.
 */
export default async function SettingsPage() {
  const session = await getSession();
  if (!session.whopUserId) {
    redirect("/api/auth/login");
  }

  return (
    <div className="w-full space-y-6 px-6 py-6 transition-colors duration-200">
      <div>
        <h1 className="text-xl tracking-tight" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
          Settings
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Connections and booking sync, in one place.
        </p>
      </div>

      <SettingsShell
        credentialsPanel={<CredentialsPanel />}
        bookingSyncPanel={<BookingSyncPanel whopUserId={session.whopUserId} />}
      />
    </div>
  );
}
