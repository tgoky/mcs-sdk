"use client";

import { useEffect, useState } from "react";
import { PlatformLogo } from "./form-fields";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { isComposioManagedProvider } from "@/lib/composio-providers";

interface VaultCredentialOption {
  id: string;
  provider: string;
  label: string;
  healthStatus: string;
  createdAt: string;
}

/**
 * A credential input that can take a freshly-pasted value, reuse one
 * already saved to the operator's vault, or (for the handful of providers
 * Composio has real OAuth for) connect the account directly with no key to
 * copy/paste at all — the same paste/reuse split `CredentialRow` offers
 * post-onboarding in update-credentials-form.tsx, brought forward into the
 * "new client" wizard so a second, third, fifth client using the same
 * GHL/ESP/hosting account doesn't need that key pasted in again.
 *
 * `value`/`onValueChange` is the raw pasted key (used verbatim in paste
 * mode, cleared in the other two). `vaultId`/`onVaultIdChange` is which
 * saved credential is selected (used verbatim in reuse mode, cleared in
 * paste mode; also set from outside by page.tsx right after a Composio
 * connect completes — see the mode-sync effect below) — submit-payload.ts
 * sends whichever one is populated per field, and the setup route links
 * the engagement to the vault row instead of writing a fresh secret when a
 * vaultId is present.
 *
 * `saveForReuse`/`reuseLabel` are only meaningful in paste mode: checking
 * the box asks the setup route to also save this pasted value into the
 * vault (see submit-payload.ts's credentialSaveForReuse and the matching
 * block in /api/engagements/setup) so it shows up in "Reuse saved" for the
 * next client — independent of, and in addition to, storing it for this
 * one engagement.
 */
export function CredentialField({
  provider,
  label,
  value,
  onValueChange,
  vaultId,
  onVaultIdChange,
  saveForReuse,
  onSaveForReuseChange,
  reuseLabel,
  onReuseLabelChange,
  placeholder,
  helpText,
  required,
  providerLogo,
}: {
  provider: string;
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  vaultId: string;
  onVaultIdChange: (v: string) => void;
  saveForReuse: boolean;
  onSaveForReuseChange: (v: boolean) => void;
  reuseLabel: string;
  onReuseLabelChange: (v: string) => void;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  providerLogo?: string;
}) {
  const composioAvailable = isComposioManagedProvider(provider);
  const [mode, setMode] = useState<"paste" | "reuse" | "connect">(vaultId ? "reuse" : "paste");
  const [options, setOptions] = useState<VaultCredentialOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "reuse" || options !== null || !provider) return;
    let cancelled = false;
    fetch(`/api/credential-vault?provider=${encodeURIComponent(provider)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load saved credentials");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setOptions(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setOptions([]);
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, provider, options]);

  const [prevVaultId, setPrevVaultId] = useState(vaultId);
  // A parent can set vaultId from outside (page.tsx does this the moment
  // it detects the wizard just landed back from a completed Composio
  // connect for this provider — see the composio-return effect there).
  // When that happens this field should visibly reflect "reuse," not sit
  // on whatever tab the user last had open. Adjusted during render rather
  // than in a useEffect — React's documented pattern for "reset/derive
  // state when a prop changes" (see
  // react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // — since a post-commit effect would cost an extra visible render pass
  // for a change that should show up immediately. Never fires the other
  // direction: clearing vaultId locally always goes through switchMode,
  // which already keeps mode in sync itself.
  if (vaultId !== prevVaultId) {
    setPrevVaultId(vaultId);
    if (vaultId) setMode("reuse");
  }

  function switchMode(next: "paste" | "reuse" | "connect") {
    setMode(next);
    setConnectError(null);
    if (next === "paste") {
      onVaultIdChange("");
    } else if (next === "reuse") {
      onValueChange("");
    }
    // "connect" clears neither — it's an action tab, not a value holder;
    // the actual vaultId only ever gets set once a connection completes.
  }

  function toggleSaveForReuse(checked: boolean) {
    onSaveForReuseChange(checked);
    if (checked && !reuseLabel.trim()) {
      onReuseLabelChange(label);
    }
  }

  async function connect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, returnTo: "/dashboard/engagements/new" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnectError(data.error ?? "Couldn't start the connection.");
        setConnecting(false);
        return;
      }
      // Full navigation, not a popup — Composio's hosted page redirects
      // straight back to /api/composio/callback, which lands the browser
      // back on this wizard (see the returnTo it was given above).
      window.location.assign(data.redirectUrl);
    } catch {
      setConnectError("Network error. Try again.");
      setConnecting(false);
    }
  }

  const dropdownItems: DropdownItem<string>[] = (options ?? []).map((o) => ({
    key: o.id,
    label: o.label,
    description: o.healthStatus === "invalid" ? "Needs attention" : undefined,
  }));

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">
          <span className="inline-flex items-center gap-1.5">
            {providerLogo && <PlatformLogo provider={providerLogo} />}
            {label}
          </span>
          {required && mode === "paste" && (
            <span className="ml-1 font-mono text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">
              (REQUIRED)
            </span>
          )}
        </label>
        <div className="flex items-center rounded-md border border-zinc-300 dark:border-zinc-800 p-0.5 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => switchMode("paste")}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              mode === "paste"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            Paste new
          </button>
          <button
            type="button"
            onClick={() => switchMode("reuse")}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              mode === "reuse"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            Reuse saved
          </button>
          {composioAvailable && (
            <button
              type="button"
              onClick={() => switchMode("connect")}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                mode === "connect"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {mode === "paste" ? (
        <div className="space-y-1.5">
          <input
            type="password"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveForReuse}
              onChange={(e) => toggleSaveForReuse(e.target.checked)}
              className="cursor-pointer"
            />
            Save this so I can reuse it for other clients
          </label>
          {saveForReuse && (
            <input
              value={reuseLabel}
              onChange={(e) => onReuseLabelChange(e.target.value)}
              placeholder={`Name it, e.g. "${label}"`}
              className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-background text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
            />
          )}
        </div>
      ) : mode === "reuse" ? (
        options === null ? (
          <div className="w-full rounded-lg border border-zinc-300 dark:border-zinc-800 px-3 py-2 text-sm text-zinc-400 dark:text-zinc-600">
            Loading saved credentials…
          </div>
        ) : options.length === 0 ? (
          <div className="w-full rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-500">
            {loadError
              ? "Couldn't load saved credentials — try pasting a new one instead."
              : `No saved ${label.toLowerCase()} credentials yet for this workspace. Paste one now and it'll be offered here next time.`}
          </div>
        ) : (
          <Dropdown
            items={dropdownItems}
            selectedKey={vaultId || null}
            onSelect={(key) => onVaultIdChange(key)}
            placeholder="Select a saved credential…"
          />
        )
      ) : (
        <div className="space-y-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800 px-3 py-2.5">
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Connect {label.replace(/\s*(API )?(Key|Token).*$/i, "") || label} securely through Composio — no key to
            copy or paste, and it&apos;s saved for reuse on future clients automatically.
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="text-[11px] font-mono font-bold px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 disabled:opacity-50 transition-all cursor-pointer"
          >
            {connecting ? "Connecting…" : "Connect via Composio"}
          </button>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-600 leading-relaxed">
            This briefly leaves this page to connect, then brings you back here. Your progress on this step is kept,
            but any other unsaved API keys will need to be re-entered.
          </p>
          {connectError && <p className="text-[11px] text-rose-600 dark:text-rose-400">{connectError}</p>}
        </div>
      )}

      {helpText && mode === "paste" && (
        <p className="text-[11px] font-normal leading-normal text-zinc-500 dark:text-zinc-400">{helpText}</p>
      )}
    </div>
  );
}
