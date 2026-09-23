"use client";

// Only what this app actually controls. Sign-in is through Whop, so name,
// email, two-step verification and sessions live in the Whop account;
// this page used to show switches and buttons for those (and a "support
// access" grant with a fixed date) that saved nothing.

import { AvatarPicker } from "./avatar-picker";
import type { UserAvatarPrefs } from "@/lib/user-avatar";

export default function ProfileSettingsClient({
  displayName,
  email,
  avatar,
}: {
  displayName: string;
  email: string;
  avatar: UserAvatarPrefs;
}) {
  const readOnlyClass =
    "w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-md text-sm text-zinc-500 dark:text-zinc-400 focus:outline-none cursor-default";

  return (
    <div className="w-full font-sans text-sm text-zinc-900 dark:text-zinc-100 space-y-4 pb-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">My Profile</h1>
      </div>

      <div className="pb-4 border-b border-zinc-200 dark:border-zinc-800/80">
        <AvatarPicker displayName={displayName} identityFallback={email || displayName} initialAvatar={avatar} />
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Name</label>
          <input type="text" readOnly value={displayName} className={readOnlyClass} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Email</label>
          <input type="text" readOnly value={email || "No email linked"} className={readOnlyClass} />
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          You sign in with Whop, so your name, email, two-step verification and signed-in devices are managed in your Whop account.
        </p>
      </div>
    </div>
  );
}
