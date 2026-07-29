"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, Link2, Check } from "lucide-react";
import { bookingPlatformLabel, emailPlatformLabel } from "@/lib/copy";

interface VaultCredential {
  id: string;
  provider: string;
  label: string;
  healthStatus: string;
  createdAt: string;
}

function CredentialRow({
  engagementId,
  provider,
  label,
  currentlyLinkedVaultId,
}: {
  engagementId: string;
  provider: string;
  label: string;
  /** If this engagement/provider is already linked to a saved credential, its id — preselects that option instead of defaulting to "enter a new key." */
  currentlyLinkedVaultId?: string | null;
}) {
  const [mode, setMode] = useState<"paste" | "reuse">(currentlyLinkedVaultId ? "reuse" : "paste");

  // ── Paste-a-new-key mode ──────────────────────────────────────────────
  const [value, setValue] = useState("");
  const [saveForReuse, setSaveForReuse] = useState(false);
  const [reuseLabel, setReuseLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Reuse-a-saved-credential mode ─────────────────────────────────────
  const [vaultOptions, setVaultOptions] = useState<VaultCredential[] | null>(null);
  const [selectedVaultId, setSelectedVaultId] = useState(currentlyLinkedVaultId ?? "");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (mode !== "reuse" || vaultOptions !== null) return;
    fetch(`/api/credential-vault?provider=${encodeURIComponent(provider)}`)
      .then((r) => r.json())
      .then((data) => setVaultOptions(data.items ?? []))
      .catch(() => setVaultOptions([]));
  }, [mode, provider, vaultOptions]);

  async function update() {
    if (!value.trim()) return;
    if (saveForReuse && !reuseLabel.trim()) {
      setError('Name this credential (e.g. "Acme\'s GHL sub-account") to save it for reuse.');
      return;
    }
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
      if (!res.ok) {
        setError(data.error ?? "Failed to update.");
        return;
      }

      if (saveForReuse) {
        const vaultRes = await fetch("/api/credential-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, label: reuseLabel.trim(), value: value.trim() }),
        });
        if (!vaultRes.ok) {
          const vaultData = await vaultRes.json().catch(() => ({}));
          // The engagement's own credential DID save successfully — only
          // the "also make it reusable" half failed. Say so precisely
          // rather than a blanket error that implies nothing was saved.
          setError(`Saved for this client, but couldn't save it as reusable: ${vaultData.error ?? "unknown error"}`);
          setSaved(true);
          setValue("");
          return;
        }
        setVaultOptions(null); // force a refetch next time "Reuse" is opened, so the new one shows up
      }

      setSaved(true);
      setValue(""); // never keep a secret in state longer than it takes to send it
      setReuseLabel("");
      setSaveForReuse(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setBusy(false);
    }
  }

  async function link() {
    if (!selectedVaultId) return;
    setLinking(true);
    setLinkError(null);
    setLinked(false);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/credentials/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, vaultId: selectedVaultId }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinked(true);
      } else {
        setLinkError(data.error ?? "Failed to link.");
      }
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Failed to link.");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="space-y-1.5 py-1.5 border-b border-zinc-100 dark:border-zinc-900/50 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono font-semibold text-zinc-500 dark:text-zinc-400">{label}</span>
        <div className="flex items-center gap-0.5 text-[10px] font-mono">
          <button
            onClick={() => setMode("paste")}
            className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
              mode === "paste"
                ? "border-gold/40 bg-gold/10 text-gold-hover dark:text-gold"
                : "border-transparent text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400"
            }`}
          >
            Enter new key
          </button>
          <button
            onClick={() => setMode("reuse")}
            className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
              mode === "reuse"
                ? "border-gold/40 bg-gold/10 text-gold-hover dark:text-gold"
                : "border-transparent text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400"
            }`}
          >
            Reuse saved
          </button>
        </div>
      </div>

      {mode === "paste" ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={value}
              onChange={(e) => { setValue(e.target.value); setSaved(false); }}
              placeholder="Paste new key / token"
              className="flex-1 min-w-0 text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              onKeyDown={(e) => e.key === "Enter" && !saveForReuse && update()}
            />
            <button
              onClick={update}
              disabled={busy || !value.trim()}
              className="text-[11px] font-mono font-bold px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-40 transition-all cursor-pointer shrink-0"
            >
              {busy ? "Saving…" : "Update"}
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 dark:text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              checked={saveForReuse}
              onChange={(e) => setSaveForReuse(e.target.checked)}
              className="cursor-pointer"
            />
            Save this so I can reuse it for other clients
          </label>
          {saveForReuse && (
            <input
              value={reuseLabel}
              onChange={(e) => setReuseLabel(e.target.value)}
              placeholder={`Name it, e.g. "Acme's ${label.replace(/ key$/i, "")} account"`}
              className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
            />
          )}
          {saved && <span className="text-[11px] font-mono text-gold-hover dark:text-gold">Saved</span>}
          {error && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {vaultOptions === null ? (
            <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">Loading saved credentials…</p>
          ) : vaultOptions.length === 0 ? (
            <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 leading-relaxed">
              No saved {label.replace(/ key$/i, "")} credentials yet —
              switch to &quot;Enter new key,&quot; check &quot;save this so I can reuse it,&quot; and it&apos;ll show up here for your next client.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={selectedVaultId}
                onChange={(e) => { setSelectedVaultId(e.target.value); setLinked(false); }}
                className="flex-1 min-w-0 text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
              >
                <option value="">— choose a saved credential —</option>
                {vaultOptions.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              <button
                onClick={link}
                disabled={linking || !selectedVaultId || selectedVaultId === currentlyLinkedVaultId}
                className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-40 transition-all cursor-pointer shrink-0"
              >
                <Link2 className="w-3 h-3" /> {linking ? "Linking…" : "Link"}
              </button>
            </div>
          )}
          {linked && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-gold-hover dark:text-gold">
              <Check className="w-3 h-3" /> Linked — this client now uses that saved credential.
            </span>
          )}
          {linkError && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{linkError}</span>}
        </div>
      )}
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
  vaultLinksByProvider,
  embedded = false,
  onRequestClose,
}: {
  engagementId: string;
  bookingPlatform?: string | null;
  emailPlatform?: string | null;
  /** provider → the vault credential id it's currently linked to, or null if it stores its own value. Absent entirely = no credential saved yet at all. */
  vaultLinksByProvider?: Record<string, string | null>;
  /** Rendered inside the Edit action menu's Modal — parent already owns visibility. */
  embedded?: boolean;
  /** Called (in addition to the internal Close button) so the wrapping Modal can dismiss itself too. */
  onRequestClose?: () => void;
}) {
  // Set by the Queue's "Fix now" link on a classified 401/403 run failure
  // (see src/lib/error-classification.ts) — opens straight to this form
  // instead of landing on a collapsed button the buyer has to know exists.
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get("fixCredential") === "1" || embedded);

  if (!bookingPlatform && !emailPlatform) return null;

  if (!open) {
    if (embedded) return null;
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
    <div className={embedded ? "space-y-3" : "rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-3 shadow-sm"}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> Update credentials
          </p>
          <button
            onClick={() => { setOpen(false); onRequestClose?.(); }}
            className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      )}
      <div className="space-y-2">
        {bookingPlatform && (
          <CredentialRow
            engagementId={engagementId}
            provider={bookingPlatform}
            label={`${bookingPlatformLabel(bookingPlatform)} key`}
            currentlyLinkedVaultId={vaultLinksByProvider?.[bookingPlatform]}
          />
        )}
        {emailPlatform && (
          <CredentialRow
            engagementId={engagementId}
            provider={emailPlatform}
            label={`${emailPlatformLabel(emailPlatform)} key`}
            currentlyLinkedVaultId={vaultLinksByProvider?.[emailPlatform]}
          />
        )}
      </div>
    </div>
  );
}
