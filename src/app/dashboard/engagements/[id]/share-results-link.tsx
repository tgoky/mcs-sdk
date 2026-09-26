"use client";

// "Share results link" from the engagement's actions menu: makes a no-login
// link to this client's results page (app/results/[token]), shows it once
// to copy, and can turn it off. Making a new link retires the old one.

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

interface Status {
  active: boolean;
  createdAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function ShareResultsLink({ engagementId, buyerName }: { engagementId: string; buyerName: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const base = `/api/engagements/${encodeURIComponent(engagementId)}/share-link`;

  useEffect(() => {
    let live = true;
    fetch(base, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.ok) setStatus(body as Status);
        else setError(body.error ?? "Couldn't check the link.");
      })
      .catch(() => live && setError("Couldn't check the link."));
    return () => {
      live = false;
    };
  }, [base]);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(base, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't make the link.");
      setUrl(body.url);
      setStatus({ active: true, createdAt: body.createdAt, viewCount: 0, lastViewedAt: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the link.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(base, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't turn the link off.");
      setUrl(null);
      setStatus({ active: false, createdAt: null, viewCount: 0, lastViewedAt: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn the link off.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy. Select the link and copy it.");
    }
  }

  const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium cursor-pointer disabled:opacity-60";
  return (
    <div className="space-y-4 text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        A page {buyerName} can open without signing in: what their products did in the last 30 days, and what they did together, with every dollar marked as paid or estimated.
      </p>

      {url ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-[12px] dark:border-zinc-800 dark:bg-zinc-900" aria-label="Results link" />
            <button type="button" onClick={copy} className={`${btn} border border-zinc-200 dark:border-zinc-800`}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[12px] text-zinc-500">Copy it now: for safety, the link is only shown once. Making a new one later stops this one working.</p>
        </div>
      ) : status?.active ? (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
          A link is live, made {status.createdAt ? day(status.createdAt) : "earlier"}
          {status.viewCount ? `, opened ${status.viewCount} ${status.viewCount === 1 ? "time" : "times"}${status.lastViewedAt ? `, last on ${day(status.lastViewedAt)}` : ""}` : ", not opened yet"}.
        </p>
      ) : status ? (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400">No link is live.</p>
      ) : (
        <p className="text-[13px] text-zinc-500">Checking…</p>
      )}

      {error && <p className="text-[13px] text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {status?.active ? (
          <button type="button" onClick={turnOff} disabled={busy} className={`${btn} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30`}>
            Turn off link
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={make} disabled={busy || !status} className={`${btn} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status?.active ? "Make a new link" : "Make link"}
        </button>
      </div>
    </div>
  );
}
