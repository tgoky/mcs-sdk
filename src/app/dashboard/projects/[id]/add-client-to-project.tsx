"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";

interface Client {
  engagementId: string;
  buyer: string;
}

export function AddClientToProject({ projectId, availableClients }: { projectId: string; availableClients: Client[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function addClient(engagementId: string) {
    const client = availableClients.find((c) => c.engagementId === engagementId);
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId }),
      });
      setOpen(false);
      if (res.ok) {
        toast.success(`${client?.buyer ?? "Client"} added to the project.`);
        router.refresh();
      } else {
        toast.error(`Could not add ${client?.buyer ?? "client"} to the project.`);
      }
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
        <div className="absolute right-0 mt-1 w-56 max-h-64 overflow-y-auto surface-glass-3 rounded-lg z-10 py-1 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150">
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
