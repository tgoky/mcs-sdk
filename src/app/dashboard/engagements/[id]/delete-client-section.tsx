"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw, TriangleAlert } from "lucide-react";

/**
 * Soft delete only (see the DELETE handler's own comment for why a hard
 * delete isn't safe here) — so this is framed as reversible, not as a
 * point of no return. Still gated behind typing the client's name exactly,
 * same "type to confirm" pattern as most infra tools use for destructive
 * actions, since a stray double-click shouldn't be able to hide a client.
 */
export function DeleteClientSection({
  engagementId,
  buyerName,
  initialDeletedAt,
  embedded = false,
  onRequestClose,
}: {
  engagementId: string;
  buyerName: string;
  initialDeletedAt: string | null;
  /** Rendered inside the Edit action menu's Modal — parent already owns visibility. */
  embedded?: boolean;
  /** Called (in addition to the internal Cancel button) so the wrapping Modal can dismiss itself too. */
  onRequestClose?: () => void;
}) {
  const router = useRouter();
  const [deletedAt, setDeletedAt] = useState(initialDeletedAt);
  const [open, setOpen] = useState(() => embedded);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeletedAt(null);
        router.refresh();
      } else {
        setError(data.error ?? "Failed to restore.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restore.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmBuyerName: confirmText }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/dashboard/engagements");
        router.refresh();
      } else {
        setError(data.error ?? "Failed to delete.");
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
      setBusy(false);
    }
  }

  if (deletedAt) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-xs font-mono text-amber-800 dark:text-amber-400">
          This client was deleted on {new Date(deletedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
          Nothing was destroyed — it&apos;s hidden from lists and every automation is paused.
        </span>
        <button
          onClick={restore}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-1.5 rounded border border-amber-300 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/40 disabled:opacity-50 transition-all cursor-pointer shrink-0"
        >
          <RotateCcw className="w-3 h-3" /> {busy ? "Restoring…" : "Restore"}
        </button>
      </div>
    );
  }

  if (!open) {
    if (embedded) return null;
    return (
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-1 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-500 dark:text-zinc-500 hover:border-rose-300 dark:hover:border-rose-900/60 hover:text-rose-600 dark:hover:text-rose-400 transition-all cursor-pointer"
        >
          <Trash2 className="w-3 h-3" /> Delete client
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 p-4 space-y-3">
      <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
        <TriangleAlert className="w-3.5 h-3.5" /> Delete {buyerName}?
      </p>
      <p className="text-[11px] text-rose-600/80 dark:text-rose-400/70 font-mono leading-relaxed">
        This hides the client everywhere and pauses every automation immediately. It doesn&apos;t erase any
        history, and it can be undone from this page afterward. Type the client&apos;s name to confirm:{" "}
        <span className="font-bold">{buyerName}</span>
      </p>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={buyerName}
          className="flex-1 text-xs font-mono px-2 py-1.5 rounded border border-rose-300 dark:border-rose-900/60 bg-background text-zinc-700 dark:text-zinc-300 placeholder:text-rose-300 dark:placeholder:text-rose-900/60"
          onKeyDown={(e) => e.key === "Enter" && confirmText === buyerName && confirmDelete()}
        />
        <button
          onClick={confirmDelete}
          disabled={busy || confirmText !== buyerName}
          className="text-[11px] font-mono font-bold px-3 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
        >
          {busy ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          onClick={() => { setOpen(false); setConfirmText(""); setError(null); onRequestClose?.(); }}
          className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer shrink-0"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
