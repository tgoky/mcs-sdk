"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

interface Client {
  engagementId: string;
  buyer: string;
}

export function AddClientToProject({ projectId, availableClients }: { projectId: string; availableClients: Client[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function addClient(engagementId: string) {
    startTransition(async () => {
      await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId }),
      });
      setOpen(false);
      router.refresh();
    });
  }

  if (availableClients.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add client
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 max-h-64 overflow-y-auto rounded-lg border border-border bg-white dark:bg-zinc-900 shadow-lg z-10 py-1">
          {availableClients.map((client) => (
            <button
              key={client.engagementId}
              type="button"
              disabled={isPending}
              onClick={() => addClient(client.engagementId)}
              className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {client.buyer}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
