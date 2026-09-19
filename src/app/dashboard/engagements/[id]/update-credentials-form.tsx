"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Link2, Check } from "lucide-react";
import { bookingPlatformLabel, emailPlatformLabel, conversationIntelligenceProviderLabel, hostingPlatformLabel, smsPlatformLabel, adDataPlatformLabel } from "@/lib/copy";
import { useToast } from "@/components/toast/toast-provider";
import { isComposioManagedProvider } from "@/lib/composio-providers";
import { isTestableCredentialProvider } from "@/lib/credential-test-providers";

interface VaultCredential {
  id: string;
  provider: string;
  label: string;
  healthStatus: string;
  createdAt: string;
}

// FIXED: Added embedded and onRequestClose to CredentialRow props
// Exported — pre-call-read-config-form.tsx and send-connect-config-form.tsx
// both used to collect Apollo/PDL/video-engagement/Cold-Open-ESP keys via a
// bare password input with no way to reuse an already-saved workspace
// credential, meaning a user who'd connected one before had to paste it
// again for every new client. This component already solved that exact
// problem generically (any provider string, paste-new vs. reuse-from-vault)
// — reusing it there instead of duplicating the paste/reuse logic a third
// and fourth time.
export function CredentialRow({
  engagementId,
  provider,
  label,
  currentlyLinkedVaultId,
  embedded = false,
  onRequestClose,
}: {
  engagementId: string;
  provider: string;
  label: string;
  currentlyLinkedVaultId?: string | null;
  embedded?: boolean;
  onRequestClose?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const composioAvailable = isComposioManagedProvider(provider);
  const testable = isTestableCredentialProvider(provider);
  const [mode, setMode] = useState<"paste" | "reuse" | "connect">(currentlyLinkedVaultId ? "reuse" : "paste");

  // Paste a new key state
  const [value, setValue] = useState("");
  const [saveForReuse, setSaveForReuse] = useState(false);
  const [reuseLabel, setReuseLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Reuse saved credential state
  const [vaultOptions, setVaultOptions] = useState<VaultCredential[] | null>(null);
  const [selectedVaultId, setSelectedVaultId] = useState(currentlyLinkedVaultId ?? "");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  // Connect-via-Composio state
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Test-connection state — /api/credentials/test already exists and is
  // already wired up on the standalone Settings > Connections diagnostics
  // page (src/app/dashboard/settings/connections/page.tsx), but was never
  // reachable from here, the actual live per-client credential UI. Surfaces
  // the same real check right where the credential itself lives.
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId, provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ ok: false, message: data.error ?? "Couldn't run the test." });
      } else if (data.ok) {
        setTestResult({ ok: true, message: "Connection works." });
      } else {
        setTestResult({ ok: false, message: data.error ?? "Connection failed." });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error. Try again." });
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    if (mode !== "reuse" || vaultOptions !== null) return;
    fetch(`/api/credential-vault?provider=${encodeURIComponent(provider)}`)
      .then((r) => r.json())
      .then((data) => setVaultOptions(data.items ?? []))
      .catch(() => setVaultOptions([]));
  }, [mode, provider, vaultOptions]);

  // Landing back from a real Composio OAuth redirect for THIS row's own
  // provider (composio/callback route.ts echoes ?composio_provider=<provider>
  // alongside ?composio_connected=<provider>/?composio_error=..., and — since
  // /api/composio/connect below now passes engagementId through —
  // ?composio_linked_engagement=<id>&composio_vault_id=<id> once the
  // callback route has already linked the new credential to this exact
  // engagement server-side. That server-side link is what makes Connect
  // work correctly no matter which page or drawer this row was opened
  // from (the engagement detail page, queue-fix-drawer, a bridge route's
  // own page, …) — this effect's job now is just to reflect that already-
  // done link in the UI, not to redo it. The one exception (fetch-then-link
  // fallback below) only fires if the server-side link didn't happen for
  // some reason — a defensive path, not the normal one anymore.
  useEffect(() => {
    if (searchParams.get("composio_provider") !== provider) return;
    const status = searchParams.get("composio_connected");
    const err = searchParams.get("composio_error");
    const linkedEngagementId = searchParams.get("composio_linked_engagement");
    const vaultId = searchParams.get("composio_vault_id");

    const url = new URL(window.location.href);
    url.searchParams.delete("composio_connected");
    url.searchParams.delete("composio_error");
    url.searchParams.delete("composio_provider");
    url.searchParams.delete("composio_linked_engagement");
    url.searchParams.delete("composio_vault_id");
    url.searchParams.delete("composio_context_engagement");
    window.history.replaceState({}, "", url.toString());

    if (err) {
      setMode("connect");
      setConnectError(err);
      return;
    }
    if (status !== provider) return;

    if (linkedEngagementId === engagementId && vaultId) {
      setVaultOptions(null);
      setSelectedVaultId(vaultId);
      setMode("reuse");
      setLinked(true);
      toast.success(`${label} connected.`);
      router.refresh();
      return;
    }

    // Defensive fallback — the server-side link either wasn't requested
    // (shouldn't happen, connect() below always passes engagementId) or
    // failed its own ownership check. Same fetch-newest-then-link this
    // effect used to always do, kept only as a safety net now.
    (async () => {
      setLinking(true);
      setLinkError(null);
      try {
        const res = await fetch(`/api/credential-vault?provider=${encodeURIComponent(provider)}`);
        const data = await res.json();
        const items: VaultCredential[] = data.items ?? [];
        if (items.length === 0) {
          throw new Error("Connected, but couldn't find the saved credential — try \"Reuse saved\" instead.");
        }
        const newest = items.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a));
        const linkRes = await fetch(`/api/engagements/${engagementId}/credentials/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, vaultId: newest.id }),
        });
        const linkData = await linkRes.json();
        if (!linkRes.ok) throw new Error(linkData.error ?? "Connected, but couldn't link it to this client.");
        setVaultOptions(items);
        setSelectedVaultId(newest.id);
        setMode("reuse");
        setLinked(true);
        toast.success(`${label} connected.`);
        router.refresh();
      } catch (e) {
        setMode("connect");
        setConnectError(e instanceof Error ? e.message : "Something went wrong finishing the connection.");
      } finally {
        setLinking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, returnTo: window.location.pathname, engagementId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnectError(data.error ?? "Couldn't start the connection.");
        setConnecting(false);
        return;
      }
      // Full navigation, not a popup — Composio's hosted page redirects
      // straight back to /api/composio/callback, which lands the browser
      // back on this exact page (see the returnTo above and the
      // composio-return effect that follows).
      window.location.assign(data.redirectUrl);
    } catch {
      setConnectError("Network error. Try again.");
      setConnecting(false);
    }
  }

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
          setError(`Saved for this client, but couldn't save it as reusable: ${vaultData.error ?? "unknown error"}`);
          setSaved(true);
          setValue("");
          return;
        }
        setVaultOptions(null);
      }
      setSaved(true);
      setValue("");
      setReuseLabel("");
      setSaveForReuse(false);
      toast.success(`${label} updated.`);
      router.refresh();

      // FIXED: Trigger auto-close on success
      if (embedded && onRequestClose) {
        setTimeout(() => {
          onRequestClose();
        }, 800);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally { // FIXED: Corrected typo 'fontally' -> 'finally'
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
        toast.success(`${label} linked.`);
        router.refresh();

        // FIXED: Trigger auto-close on success
        if (embedded && onRequestClose) {
          setTimeout(() => {
            onRequestClose();
          }, 800);
        }
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
            className={`hover-lift press-settle px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
              mode === "paste"
                ? "border-ink/40 bg-ink/10 text-ink-hover dark:text-ink"
                : "border-transparent text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400"
            }`}
          >
            Enter new key
          </button>
          <button
            onClick={() => setMode("reuse")}
            className={`hover-lift press-settle px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
              mode === "reuse"
                ? "border-ink/40 bg-ink/10 text-ink-hover dark:text-ink"
                : "border-transparent text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400"
            }`}
          >
            Reuse saved
          </button>
          {composioAvailable && (
            <button
              onClick={() => { setMode("connect"); setConnectError(null); }}
              className={`hover-lift press-settle px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                mode === "connect"
                  ? "border-ink/40 bg-ink/10 text-ink-hover dark:text-ink"
                  : "border-transparent text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400"
              }`}
            >
              Connect
            </button>
          )}
        </div>
      </div>
      {testable && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={testConnection}
            disabled={testing}
            className="hover-lift press-settle text-[10px] font-mono font-semibold text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-40 transition-colors cursor-pointer"
          >
            {testing ? "Testing connection " : "Test connection"}
          </button>
          {testResult && (
            <span className={`text-[10px] font-mono ${testResult.ok ? "text-ink-hover dark:text-ink" : "text-rose-600 dark:text-rose-400"}`}>
              {testResult.ok ? "✓" : "✗"} {testResult.message}
            </span>
          )}
        </div>
      )}
      {mode === "paste" ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={value}
              onChange={(e) => { setValue(e.target.value); setSaved(false); }}
              placeholder="Paste new key / token"
              className="flex-1 min-w-0 text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-background text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              onKeyDown={(e) => e.key === "Enter" && !saveForReuse && update()}
            />
            <button
              onClick={update}
              disabled={busy || !value.trim()}
              className="hover-lift press-settle text-[11px] font-mono font-bold px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-40 transition-all cursor-pointer shrink-0"
            >
              {busy ? "Saving " : "Update"}
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
              className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-background text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
            />
          )}
          {saved && <span className="text-[11px] font-mono text-ink-hover dark:text-ink">Saved</span>}
          {error && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
      ) : mode === "reuse" ? (
        <div className="space-y-1.5">
          {vaultOptions === null ? (
            <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">Loading saved credentials </p>
          ) : vaultOptions.length === 0 ? (
            <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 leading-relaxed">
              No saved {label.replace(/ key$/i, "")} credentials yet 
              switch to &quot;Enter new key,&quot; check &quot;save this so I can reuse it,&quot; and it&apos;ll show up here for your next client.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={selectedVaultId}
                onChange={(e) => { setSelectedVaultId(e.target.value); setLinked(false); }}
                className="flex-1 min-w-0 text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-background text-zinc-700 dark:text-zinc-300"
              >
                <option value="">choose a saved credential</option>
                {vaultOptions.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              <button
                onClick={link}
                disabled={linking || !selectedVaultId || selectedVaultId === currentlyLinkedVaultId}
                className="hover-lift press-settle inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-40 transition-all cursor-pointer shrink-0"
              >
                <Link2 className="w-3 h-3" /> {linking ? "Linking " : "Link"}
              </button>
            </div>
          )}
          {linked && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-ink-hover dark:text-ink">
              <Check className="w-3 h-3" /> Linked this client now uses that saved credential.
            </span>
          )}
          {linkError && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{linkError}</span>}
        </div>
      ) : (
        <div className="space-y-1.5 rounded border border-dashed border-zinc-300 dark:border-zinc-800 px-2 py-1.5">
          <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500 leading-relaxed">
            Connect {label.replace(/ key$/i, "")} securely — no key to copy or paste, and it&apos;s saved for reuse
            on future clients automatically.
          </p>
          <button
            onClick={connect}
            disabled={connecting || linking}
            className="hover-lift press-settle text-[11px] font-mono font-bold px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-40 transition-all cursor-pointer"
          >
            {linking ? "Finishing connection " : connecting ? "Connecting " : "Connect via Composio"}
          </button>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-600 leading-relaxed">
            This briefly leaves this page to connect, then brings you back here and links it automatically.
          </p>
          {connectError && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{connectError}</span>}
        </div>
      )}
    </div>
  );
}

export function UpdateCredentialsForm({
  engagementId,
  bookingPlatform,
  emailPlatform,
  conversationIntelligenceProvider,
  hostingPlatform,
  smsPlatform,
  adDataPlatform,
  vaultLinksByProvider,
  embedded = false,
  onRequestClose,
}: {
  engagementId: string;
  bookingPlatform?: string | null;
  emailPlatform?: string | null;
  conversationIntelligenceProvider?: string | null;
  // Phase 6 addition — hosting/sms/ad-data platform choice previously had
  // no credential UI anywhere post-creation (only settable during the big
  // new-engagement wizard). "none" is a real, valid sms_platform/
  // ad_data_platform value (not connected), so those two are only shown
  // when set to something else.
  hostingPlatform?: string | null;
  smsPlatform?: string | null;
  adDataPlatform?: string | null;
  vaultLinksByProvider?: Record<string, string | null>;
  embedded?: boolean;
  onRequestClose?: () => void;
}) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get("fixCredential") === "1" || embedded);
  const hasRecall = conversationIntelligenceProvider === "recall_ai";
  const hasSms = !!smsPlatform && smsPlatform !== "none";
  const hasAdData = !!adDataPlatform && adDataPlatform !== "none";
  if (!bookingPlatform && !emailPlatform && !hasRecall && !hostingPlatform && !hasSms && !hasAdData) return null;

  if (!open) {
    if (embedded) return null;
    return (
      <button
        onClick={() => setOpen(true)}
        className="hover-lift press-settle inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-1 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all cursor-pointer"
      >
        <KeyRound className="w-3 h-3" /> Update credentials
      </button>
    );
  }

  return (
    <div className={embedded ? "space-y-3" : "surface-glass-2 rounded-lg p-4 space-y-3"}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" /> Update credentials
          </p>
          <button
            onClick={() => { setOpen(false); onRequestClose?.(); }}
            className="hover-lift press-settle text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      )}
      <div className="space-y-2">
        {/* FIXED: Forwarding embedded and onRequestClose to CredentialRow instances */}
        {bookingPlatform && (
          <CredentialRow
            engagementId={engagementId}
            provider={bookingPlatform}
            label={`${bookingPlatformLabel(bookingPlatform)} key`}
            currentlyLinkedVaultId={vaultLinksByProvider?.[bookingPlatform]}
            embedded={embedded}
            onRequestClose={onRequestClose}
          />
        )}
        {emailPlatform && (
          <CredentialRow
            engagementId={engagementId}
            provider={emailPlatform}
            label={`${emailPlatformLabel(emailPlatform)} key`}
            currentlyLinkedVaultId={vaultLinksByProvider?.[emailPlatform]}
            embedded={embedded}
            onRequestClose={onRequestClose}
          />
        )}
        {hasRecall && (
          <CredentialRow
            engagementId={engagementId}
            provider="recall_ai"
            label={`${conversationIntelligenceProviderLabel("recall_ai")} key`}
            currentlyLinkedVaultId={vaultLinksByProvider?.["recall_ai"]}
            embedded={embedded}
            onRequestClose={onRequestClose}
          />
        )}
        {hostingPlatform && (
          <CredentialRow
            engagementId={engagementId}
            provider={hostingPlatform}
            label={`${hostingPlatformLabel(hostingPlatform)} key`}
            currentlyLinkedVaultId={vaultLinksByProvider?.[hostingPlatform]}
            embedded={embedded}
            onRequestClose={onRequestClose}
          />
        )}
        {hasSms && (
          <CredentialRow
            engagementId={engagementId}
            provider={smsPlatform!}
            label={`${smsPlatformLabel(smsPlatform)} key`}
            currentlyLinkedVaultId={vaultLinksByProvider?.[smsPlatform!]}
            embedded={embedded}
            onRequestClose={onRequestClose}
          />
        )}
        {hasAdData && (
          <CredentialRow
            engagementId={engagementId}
            provider={adDataPlatform!}
            label={`${adDataPlatformLabel(adDataPlatform)} key`}
            currentlyLinkedVaultId={vaultLinksByProvider?.[adDataPlatform!]}
            embedded={embedded}
            onRequestClose={onRequestClose}
          />
        )}
      </div>
    </div>
  );
}