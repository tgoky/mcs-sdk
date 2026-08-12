import { getSession } from "@/lib/session";

export default async function ProfileSettingsPage() {
  const session = await getSession();

  return (
    <div className="max-w-2xl space-y-6 font-sans">
      <div>
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Profile</h1>
        <p className="text-xs text-zinc-400 mt-1">Manage your account identity and access details.</p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4 text-xs">
        <div className="grid grid-cols-3 gap-4 pb-3 border-b border-zinc-800">
          <span className="text-zinc-400 font-medium">Email</span>
          <span className="col-span-2 text-zinc-200 font-mono">{session.email || "Not set"}</span>
        </div>

        <div className="grid grid-cols-3 gap-4 pb-3 border-b border-zinc-800">
          <span className="text-zinc-400 font-medium">Whop User ID</span>
          <span className="col-span-2 text-zinc-200 font-mono">{session.whopUserId || "Unlinked"}</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <span className="text-zinc-400 font-medium">Subscription Status</span>
          <span className="col-span-2 text-emerald-400 font-mono capitalize">
            {session.subscriptionStatus || "Active"}
          </span>
        </div>
      </div>
    </div>
  );
}