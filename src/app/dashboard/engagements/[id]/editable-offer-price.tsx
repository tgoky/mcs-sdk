"use client";

import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function EditableOfferPrice({
  engagementId,
  initialPrice,
  offerDetails,
}: {
  engagementId: string;
  initialPrice?: string;
  offerDetails: Record<string, any> | null;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [price, setPrice] = useState(initialPrice || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerDetails: {
            ...offerDetails,
            price: price.trim(),
          },
        }),
      });

      if (res.ok) {
        setIsEditing(false);
        router.refresh();
      }
    } catch (e) {
      console.error("Failed to update price:", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 select-none block mb-0.5">
        Price
      </span>

      {isEditing ? (
        <div className="flex items-center gap-1.5 justify-end">
          <div className="flex items-center text-sm font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700 shadow-xs">
            <span className="text-zinc-400 dark:text-zinc-500 mr-0.5">$</span>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              className="w-20 bg-transparent outline-none font-bold tabular-nums text-zinc-900 dark:text-zinc-100"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setIsEditing(false);
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="p-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Save Price"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setPrice(initialPrice || "");
              setIsEditing(false);
            }}
            disabled={saving}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            title="Cancel"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="group flex items-center gap-1.5 justify-end hover:opacity-80 transition-all cursor-pointer text-right"
          title="Click to edit price"
        >
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {price ? (
              `$${price}`
            ) : (
              <span className="text-xs text-zinc-400 font-mono font-normal underline decoration-dashed">
                Set price
              </span>
            )}
          </span>
          <Pencil
            size={12}
            className="text-zinc-400 dark:text-zinc-500 group-hover:text-amber-400 transition-colors"
          />
        </button>
      )}
    </div>
  );
}