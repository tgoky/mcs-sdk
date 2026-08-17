"use client";

import { useState } from "react";
import { User, Plus } from "lucide-react";

export default function ProfileSettingsPage({ session }: { session?: any }) {
  const [supportAccess, setSupportAccess] = useState(true);
  const [twoStepAuth, setTwoStepAuth] = useState(false);

  // Derive initial names from real session data if present
  const fullName = session?.name || "";
  const nameParts = fullName.trim().split(" ");
  const [firstName, setFirstName] = useState(nameParts[0] || "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" ") || "");

  return (
    <div className="w-full font-sans text-sm text-zinc-900 dark:text-zinc-100 space-y-4 pb-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          My Profile
        </h1>
      </div>

      {/* Profile Image Row */}
      <div className="space-y-2 pb-4 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
            <User size={24} className="text-zinc-500 dark:text-zinc-400" />
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer px-2.5 py-1 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-950 rounded-md text-xs font-medium hover:bg-zinc-800 dark:hover:bg-white transition-colors flex items-center gap-1">
              <Plus size={13} />
              <span>Change Image</span>
              <input type="file" accept="image/png, image/jpeg, image/gif" className="hidden" />
            </label>
            <button
              type="button"
              className="px-2.5 py-1 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 rounded-md text-xs font-medium transition-colors"
            >
              Remove Image
            </button>
          </div>
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          We support PNGs, JPEGs and GIFs under 2MB
        </p>
      </div>

      {/* Name Inputs */}
      <div className="grid grid-cols-2 gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            First Name
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-600 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Last Name
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-600 transition-colors"
          />
        </div>
      </div>

      {/* Account Security */}
      <div className="space-y-3 pb-4 border-b border-zinc-200 dark:border-zinc-800/80">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Account Security
        </h2>

        {/* Email */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </label>
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              readOnly
              value={session?.email || "No email linked"}
              className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 rounded-md text-sm text-zinc-500 dark:text-zinc-400 focus:outline-none cursor-not-allowed"
            />
            <button
              type="button"
              className="shrink-0 px-2.5 py-1.5 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 rounded-md text-xs font-medium transition-colors"
            >
              Change email
            </button>
          </div>
        </div>

        {/* 2-Step Verifications */}
        <div className="flex items-center justify-between pt-1">
          <div className="space-y-0.5">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 block">
              2-Step Verifications
            </span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Add an additional layer of security to your account during login.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTwoStepAuth(!twoStepAuth)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              twoStepAuth ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-zinc-900 shadow-sm transition duration-200 ease-in-out ${
                twoStepAuth ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Support Access Section */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Support Access
        </h2>

        {/* Toggle Support Access */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 block">
              Support access
            </span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-xl">
              You have granted us access to your account for support purposes until Aug 31, 2026, 9:40 PM.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSupportAccess(!supportAccess)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              supportAccess ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-zinc-900 shadow-sm transition duration-200 ease-in-out ${
                supportAccess ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Log out of all devices */}
        <div className="flex items-center justify-between pt-2.5 border-t border-zinc-200 dark:border-zinc-800/60">
          <div className="space-y-0.5">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 block">
              Log out of all devices
            </span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Log out of all other active sessions on other devices besides this one.
            </p>
          </div>
          <button
            type="button"
            className="px-2.5 py-1 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 rounded-md text-xs font-medium transition-colors"
          >
            Log out
          </button>
        </div>

        {/* Delete my account */}
        <div className="flex items-center justify-between pt-2.5 border-t border-zinc-200 dark:border-zinc-800/60">
          <div className="space-y-0.5">
            <span className="text-sm font-medium text-rose-600 dark:text-rose-400 block">
              Delete my account
            </span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Permanently delete the account and remove access from all workspaces.
            </p>
          </div>
          <button
            type="button"
            className="px-2.5 py-1 border border-zinc-300 dark:border-zinc-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-md text-xs font-medium transition-colors"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}