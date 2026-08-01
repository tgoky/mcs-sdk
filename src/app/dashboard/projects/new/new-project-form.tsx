"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SKILLS, SKILL_INFO } from "@/lib/copy";
import type { SkillId } from "@/lib/skill-manifest";

interface Client {
  engagementId: string;
  buyer: string;
}

export function NewProjectForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabledSkills, setEnabledSkills] = useState<Set<SkillId>>(new Set());
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggleSkill(skillId: SkillId) {
    setEnabledSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  function toggleClient(engagementId: string) {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(engagementId)) next.delete(engagementId);
      else next.add(engagementId);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          enabledSkills: Array.from(enabledSkills),
          engagementIds: Array.from(selectedClients),
        }),
      });

      if (!res.ok) {
        setError("Couldn't create the project — try again.");
        return;
      }

      const data = await res.json();
      router.push(`/dashboard/projects/${data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Project name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Funnel Monitoring — Q3 batch"
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gold/40 resize-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Default skills — clients added to this project get exactly these turned on, everything else off
        </label>
        <div className="flex flex-col gap-1">
          {SKILLS.map((skillId) => (
            <label
              key={skillId}
              className="flex items-start gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
            >
              <input
                type="checkbox"
                checked={enabledSkills.has(skillId)}
                onChange={() => toggleSkill(skillId)}
                className="mt-0.5 accent-gold"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {SKILL_INFO[skillId].name}
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-500">{SKILL_INFO[skillId].description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Add clients now (optional — {selectedClients.size} selected)
        </label>
        {clients.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-600">No clients yet — create one first, or leave this project empty for now.</p>
        ) : (
          <div className="max-h-52 overflow-y-auto flex flex-col gap-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 p-1.5">
            {clients.map((client) => (
              <label
                key={client.engagementId}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedClients.has(client.engagementId)}
                  onChange={() => toggleClient(client.engagementId)}
                  className="accent-gold"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{client.buyer}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-semibold bg-gold text-gold-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create project"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
