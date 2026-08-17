"use client";

import { useState } from "react";
import { User, ShieldAlert, LogOut, Trash2, Camera } from "lucide-react";

export default function ProfileSettingsPage({ session }: { session?: any }) {
  const [supportAccess, setSupportAccess] = useState(true);
  const [firstName, setFirstName] = useState("Brian");
  const [lastName, setLastName] = useState("Frederin");

  return (
    <div className="max-w-3xl space-y-8 font-sans text-xs">
      <div>
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight">My Profile</h1>
        <p className="text-zinc-400 mt-0.5">Manage your user identity, avatar, and account access permissions.</p>
      </div>

      {/* Avatar Section */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <span className="text-zinc-300 font-semibold block">Profile Avatar</span>
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
            <User size={32} className="text-zinc-400" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5">
                <Camera size={14} />
                <span>Change Image</span>
                <input type="file" accept="image/png, image/jpeg, image/gif" className="hidden" />
              </label>
              <button 
                type="button" 
                className="px-3 py-1.5 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded-lg transition-colors"
              >
                Remove Image
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">Supports PNG, JPEG, and GIF under 2MB.</p>
          </div>
        </div>
      </div>

      {/* Identity Fields */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <span className="text-zinc-300 font-semibold block">Personal Identity</span>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-zinc-400 font-medium">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-700"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-zinc-400 font-medium">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-800/60 grid grid-cols-3 gap-4 items-center">
          <span className="text-zinc-400 font-medium">Email</span>
          <span className="col-span-2 text-zinc-200 font-mono">{session?.email || "user@domain.com"}</span>
        </div>

        <div className="grid grid-cols-3 gap-4 items-center">
          <span className="text-zinc-400 font-medium">Whop User ID</span>
          <span className="col-span-2 text-zinc-200 font-mono">{session?.whopUserId || "usr_whop_linked"}</span>
        </div>

        <div className="grid grid-cols-3 gap-4 items-center">
          <span className="text-zinc-400 font-medium">Subscription Status</span>
          <span className="col-span-2 text-emerald-400 font-mono capitalize">
            {session?.subscriptionStatus || "Active"}
          </span>
        </div>
      </div>

      {/* Support Access & Security */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-5">
        <div>
          <span className="text-zinc-300 font-semibold block">Support Access</span>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Grant temporary access to support staff for troubleshooting without sharing auth tokens.
          </p>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-b border-zinc-800/60">
          <div>
            <span className="text-zinc-200 font-medium block">Allow Support Access</span>
            <span className="text-[11px] text-zinc-500">
              {supportAccess ? "Access granted until revoked or access period expires." : "Support access disabled."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSupportAccess(!supportAccess)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              supportAccess ? "bg-emerald-500" : "bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                supportAccess ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Sessions & Danger Zone */}
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-zinc-200 font-medium block">Active Sessions</span>
              <span className="text-[11px] text-zinc-500">Log out of all other devices and revoke active session cookies.</span>
            </div>
            <button
              type="button"
              className="px-3 py-1.5 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded-lg font-medium transition-colors flex items-center gap-1.5"
            >
              <LogOut size={13} />
              <span>Log Out All</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-800/60">
            <div>
              <span className="text-rose-400 font-semibold block">Delete Account</span>
              <span className="text-[11px] text-zinc-500">Permanently remove your account, workspace data, and integrations.</span>
            </div>
            <button
              type="button"
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg font-medium transition-colors flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              <span>Delete Account</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}