"use client";

// The client's own details, the same for every product: its name, its
// website (what setups read the business from), its time zone (when
// sends, briefs and reports happen), and how long new Queue items stay
// pinned at the top.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ChoiceSelect } from "@/components/skill-settings/skill-settings-panel";
import { COMMON_TIMEZONES } from "@/lib/timezones";
import { useToast } from "@/components/toast/toast-provider";

const inputCls =
  "h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:focus:border-white/25";

export function ClientDetailsForm({ engagementId, onClose }: { engagementId: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const url = `/api/engagements/${encodeURIComponent(engagementId)}/client-details`;
  const [v, setV] = useState<{ name: string; website: string; timezone: string; queuePinWindowHours: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => live && setV({ name: b.name ?? "", website: b.website ?? "", timezone: b.timezone ?? "", queuePinWindowHours: String(b.queuePinWindowHours ?? 48) }))
      .catch(() => live && setError("Couldn't load the client's details."));
    return () => {
      live = false;
    };
  }, [url]);

  if (!v) return <p className="flex items-center gap-2 text-sm text-zinc-500">{error ?? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</>}</p>;
  const zones = COMMON_TIMEZONES.some((z) => z.value === v.timezone) || !v.timezone ? COMMON_TIMEZONES : [{ value: v.timezone, label: v.timezone }, ...COMMON_TIMEZONES];

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...v, queuePinWindowHours: Math.round(Number(v!.queuePinWindowHours)) }) }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setSaving(false);
    if (!res?.ok) return setError((body as { error?: string }).error ?? "Couldn't save.");
    toast.success("Client details saved.");
    router.refresh();
    onClose();
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Name</span>
        <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={inputCls} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Website</span>
        <input value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} placeholder="acme.com" className={inputCls} />
        <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">Where every product&apos;s setup reads the business from.</span>
      </label>
      <div className="space-y-1.5">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Time zone</span>
        <ChoiceSelect label="Time zone" value={v.timezone || null} options={zones} onChange={(tz) => setV({ ...v, timezone: tz })} />
        <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">When texts go out, briefs are written and reports are sent.</span>
      </div>
      <label className="flex items-center justify-between gap-4">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Keep new Queue items at the top for</span>
        <span className="flex items-center gap-2">
          <input type="number" min={1} max={720} value={v.queuePinWindowHours} onChange={(e) => setV({ ...v, queuePinWindowHours: e.target.value })} className={`${inputCls} w-20 text-right`} aria-label="Hours new Queue items stay at the top" />
          <span className="text-[13px] text-zinc-500">hours</span>
        </span>
      </label>
      {error && <p className="text-[12.5px] text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-zinc-200/70 pt-3 dark:border-white/10">
        <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-[13px] text-zinc-600 hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/5 cursor-pointer">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-[13px] font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}
