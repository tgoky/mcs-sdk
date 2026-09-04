"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export type ChecklistItem = { key: string; label: string; completed: boolean; completedAt: string | null };

/** Shared checklist UI for Move A/B/C's sub-pages — same fetch/toggle
 * contract against /api/engagements/[id]/offensive/checklist/[move],
 * just the list rendering pulled out once instead of copy-pasted three
 * times. */
export function OffensiveChecklist({ engagementId, move }: { engagementId: string; move: "a" | "b" | "c" }) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/engagements/${engagementId}/offensive/checklist/${move}`);
      const data = await res.json();
      if (!cancelled && res.ok) setItems(data.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId, move]);

  async function toggle(key: string, next: boolean) {
    setPendingKey(key);
    setItems((prev) => prev?.map((i) => (i.key === key ? { ...i, completed: next } : i)) ?? null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/offensive/checklist/${move}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: key, completed: next }),
      });
      if (!res.ok) {
        setItems((prev) => prev?.map((i) => (i.key === key ? { ...i, completed: !next } : i)) ?? null);
      }
    } finally {
      setPendingKey(null);
    }
  }

  if (!items) return <p className="text-xs text-zinc-400 dark:text-zinc-500 italic font-mono">Loading checklist…</p>;

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <label
          key={item.key}
          className="flex items-start gap-2.5 py-1.5 cursor-pointer select-none"
          onClick={(e) => {
            e.preventDefault();
            if (pendingKey === item.key) return;
            toggle(item.key, !item.completed);
          }}
        >
          <span
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              item.completed
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "border-zinc-300 dark:border-zinc-700 bg-transparent"
            }`}
          >
            {item.completed && <Check size={11} strokeWidth={3} />}
          </span>
          <span className={`text-xs leading-snug ${item.completed ? "text-zinc-400 dark:text-zinc-500 line-through" : "text-zinc-700 dark:text-zinc-300"}`}>
            {item.label}
          </span>
        </label>
      ))}
    </div>
  );
}
