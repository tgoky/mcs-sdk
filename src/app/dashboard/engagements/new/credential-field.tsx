"use client";

import { useEffect, useState } from "react";
import { PlatformLogo } from "./form-fields";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";

interface VaultCredentialOption {
  id: string;
  provider: string;
  label: string;
  healthStatus: string;
  createdAt: string;
}

/**
 * A credential input that can either take a freshly-pasted value or reuse
 * one already saved to the operator's vault — the same paste/reuse split
 * `CredentialRow` offers post-onboarding in update-credentials-form.tsx,
 * brought forward into the "new client" wizard so a second, third, fifth
 * client using the same GHL/ESP/hosting account doesn't need that key
 * pasted in again.
 *
 * `value`/`onValueChange` is the raw pasted key (used verbatim in paste
 * mode, cleared in reuse mode). `vaultId`/`onVaultIdChange` is which saved
 * credential is selected (used verbatim in reuse mode, cleared in paste
 * mode) — submit-payload.ts sends whichever one is populated per field,
 * and the setup route links the engagement to the vault row instead of
 * writing a fresh secret when a vaultId is present.
 */
export function CredentialField({
  provider,
  label,
  value,
  onValueChange,
  vaultId,
  onVaultIdChange,
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
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  providerLogo?: string;
}) {
  const [mode, setMode] = useState<"paste" | "reuse">(vaultId ? "reuse" : "paste");
  const [options, setOptions] = useState<VaultCredentialOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);

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

  function switchMode(next: "paste" | "reuse") {
    setMode(next);
    if (next === "paste") {
      onVaultIdChange("");
    } else {
      onValueChange("");
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
        </div>
      </div>

      {mode === "paste" ? (
        <input
          type="password"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs"
        />
      ) : options === null ? (
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
      )}

      {helpText && mode === "paste" && (
        <p className="text-[11px] font-normal leading-normal text-zinc-500 dark:text-zinc-400">{helpText}</p>
      )}
    </div>
  );
}
