"use client";

// Bridge Manager's own page: where Whop events are forwarded, the secret the
// receiver checks them with, and any field renames. Changing any of it is
// Configure in the page header, which opens Whop Agent's setup on this
// skill (see config-form-registry.tsx), so there's one place to edit it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Copy } from "lucide-react";

type BridgeConfig = { destinationUrl: string; fieldMapping: Record<string, string>; signingSecret: string | null };

export function BridgeManagerConsole({ engagementId }: { engagementId: string }) {
  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/engagements/${engagementId}/whop-agent/bridge-config`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't load the bridge.");
        if (!cancelled) setConfig(data as BridgeConfig);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the bridge."));
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  if (error) return <p className="text-sm text-[var(--error)]">{error}</p>;
  if (!config) return <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" aria-busy="true" />;

  const renames = Object.entries(config.fieldMapping ?? {});
  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-2xl border border-zinc-200/60 p-4 dark:border-zinc-800/60">
        {config.destinationUrl ? (
          <>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Whop events are forwarded to</p>
            <p className="break-all font-medium text-zinc-900 dark:text-zinc-100">{config.destinationUrl}</p>
          </>
        ) : (
          <p className="text-[14px] text-zinc-600 dark:text-zinc-400">Nothing is forwarded yet. Add where Whop events should go with Configure above.</p>
        )}
        {config.signingSecret && (
          <div className="space-y-1 pt-2">
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              Each delivery is signed in the <code>X-Whop-Agent-Signature</code> header with this secret, so the receiver can check it came from here:
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-zinc-100 px-2 py-1 text-[12px] dark:bg-zinc-900">{config.signingSecret}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(config.signingSecret ?? "")
                    .then(() => setCopied(true))
                    .catch(() => undefined);
                }}
                className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
              >
                <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
        {renames.length > 0 && (
          <p className="pt-2 text-[13px] text-zinc-500 dark:text-zinc-400">
            Renamed on the way: {renames.map(([from, to]) => `${from} to ${to}`).join(", ")}.
          </p>
        )}
      </section>

      <div className="space-y-1">
        <Link href={`/dashboard/engagements/${engagementId}/skills/whop-webhook-audit`} className="flex items-center gap-1 text-sm font-semibold text-zinc-700 hover:underline dark:text-zinc-300">
          Webhook fleet health <ArrowUpRight className="h-3 w-3" />
        </Link>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Gap replay after an outage is bounded to 30 days and runs automatically once a disabled subscription passes a health probe and is re-enabled there.
        </p>
      </div>
    </div>
  );
}
