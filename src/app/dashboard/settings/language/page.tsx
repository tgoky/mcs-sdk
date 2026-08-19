import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { redirect } from "next/navigation";
import { TimezoneRegionForm } from "./timezone-region-form";

export default async function TimezoneRegionSettingsPage() {
  const session = await getSession();
  if (!session.whopUserId) {
    redirect("/api/auth/login");
  }

  const workspace = await getActiveWorkspace(session.whopUserId);

  return (
    <div className="w-full max-w-2xl font-sans text-sm text-zinc-900 dark:text-zinc-100 space-y-4 pb-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Timezones & Region</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Set the default timezone and date format for {workspace.name}.
        </p>
      </div>

      <TimezoneRegionForm
        workspaceId={workspace.workspaceId}
        initialTimezone={workspace.timezone}
        initialLocale={workspace.locale}
      />
    </div>
  );
}
