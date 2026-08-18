"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, Settings2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { conversationIntelligenceProviderLabel } from "@/lib/copy";

/**
 * Connect/disconnect control for this engagement's call intelligence
 * (Recall.ai) integration, surfaced directly in the Modify menu — same
 * spot as the Co-Pilot/Autopilot toggle above it — rather than being
 * buried as a field inside Edit Stack Settings with no other visibility.
 *
 * "Connect" can't be a single click here the way Autopilot is: turning
 * this on for real needs a region, and usually an API key and webhook
 * signing secret too, so it opens Edit Stack Settings scrolled to the
 * Call Intelligence section instead of flipping a bare boolean. See
 * EditStackSettings' initialHighlightSection prop for how that deep
 * link works without a full page reload.
 *
 * "Disconnect" IS a direct action — it only flips
 * conversation_intelligence_provider back to "none". It deliberately
 * leaves the region/bot-name/signing-secret and any stored Recall API
 * key untouched, so reconnecting later doesn't mean re-entering
 * everything — same reasoning storeCredential uses for not wiping a
 * vault link on an unrelated edit.
 */
export function CallIntelligenceToggle({
  engagementId,
  initialProvider,
  onManage,
}: {
  engagementId: string;
  initialProvider: string | null | undefined;
  /** Opens Edit Stack Settings, scrolled/highlighted to the Call Intelligence section. */
  onManage: () => void;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState(initialProvider ?? "none");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = provider === "recall_ai";

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stack: { conversation_intelligence_provider: "none" } }),
      });
      const data = await res.json();
      if (res.ok) {
        setProvider("none");
        setConfirming(false);
        router.refresh();
      } else {
        setError(data.error ?? "Failed to disconnect.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect.");
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="p-2.5 rounded-xl border border-border bg-zinc-50 dark:bg-zinc-900/50 space-y-2 select-none">
        <p className="text-xs font-sans text-zinc-700 dark:text-zinc-300 leading-normal">
          Disconnect call intelligence? No new bots will join calls, and objections will stop auto-updating from live calls. Nothing already stored is deleted.
        </p>
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="inline-flex items-center justify-center text-xs font-sans font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm disconnect"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs font-sans font-medium px-2.5 py-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs font-sans text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1 select-none">
      <div
        className={cn(
          "group w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl text-left transition-colors",
          "text-zinc-800 dark:text-zinc-200"
        )}
      >
        <button
          type="button"
          onClick={onManage}
          className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <Radio className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors" />
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-sans font-medium leading-snug">
              Call intelligence
            </span>
            <span className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 leading-normal truncate">
              {connected ? `Connected — ${conversationIntelligenceProviderLabel(provider)}` : "Not connected"}
            </span>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {connected && (
            <button
              type="button"
              onClick={onManage}
              title="Manage settings"
              className="p-1 rounded-lg text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={connected ? () => setConfirming(true) : onManage}
            className="text-[11px] font-mono font-bold px-2 py-1 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all cursor-pointer"
          >
            {connected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs font-sans text-rose-600 dark:text-rose-400 px-2.5">{error}</p>}
    </div>
  );
}
