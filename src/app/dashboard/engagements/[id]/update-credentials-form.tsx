"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { bookingPlatformLabel, emailPlatformLabel } from "@/lib/copy";

function CredentialRow({
  engagementId,
  provider,
  label,
}: {
  engagementId: string;
  provider: string;
  label: string;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function update() {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId, provider, value: value.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        setValue(""); // never keep a secret in state longer than it takes to send it
      } else {
        setError(data.error ?? "Failed to update.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 w-36 shrink-0 truncate">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        placeholder="Paste new key / token"
        className="flex-1 min-w-0 text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
        onKeyDown={(e) => e.key === "Enter" && update()}
      />
      <button
        onClick={update}
        disabled={busy || !value.trim()}
        className="text-[11px] font-mono font-bold px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-40 transition-all cursor-pointer shrink-0"
      >
        {busy ? "Updating…" : "Update"}
      </button>
      {saved && <span className="text-[11px] font-mono text-gold-hover dark:text-gold shrink-0">Saved</span>}
      {error && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400 shrink-0">{error}</span>}
    </div>
  );
}

/**
 * Re-enters a credential value for a platform already configured on this
 * engagement — the fix for "the credential is wrong and there's nowhere to
 * update it." Auto-scoped to this engagementId and whichever platforms are
 * actually set on the stack, unlike the generic /dashboard/credentials
 * page, which requires typing the engagement ID by hand and has no picker.
 * Posts to the same POST /api/credentials the generic page already uses
 * (which upserts on (engagementId, provider)) — no new backend needed.
 */
export function UpdateCredentialsForm({
  engagementId,
  bookingPlatform,
  emailPlatform,
}: {
  engagementId: string;
  bookingPlatform?: string | null;
  emailPlatform?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!bookingPlatform && !emailPlatform) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-1 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all cursor-pointer"
      >
        <KeyRound className="w-3 h-3" /> Update credentials
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> Update credentials
        </p>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
      <div className="space-y-2">
        {bookingPlatform && (
          <CredentialRow
            engagementId={engagementId}
            provider={bookingPlatform}
            label={`${bookingPlatformLabel(bookingPlatform)} key`}
          />
        )}
        {emailPlatform && (
          <CredentialRow
            engagementId={engagementId}
            provider={emailPlatform}
            label={`${emailPlatformLabel(emailPlatform)} key`}
          />
        )}
      </div>
    </div>
  );
}
