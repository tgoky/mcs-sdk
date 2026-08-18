"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SKILLS, SKILL_INFO, type SkillName } from "@/lib/copy";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";

interface Client {
  engagementId: string;
  buyer: string;
}

export function NewProjectForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabledSkills, setEnabledSkills] = useState<Set<SkillName>>(new Set(SKILLS));
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggleSkill(skillId: SkillName) {
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 font-sans">
      {/* Project Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
          Project Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Core SaaS Client Stack"
          className="rounded-xl border border-border bg-white/80 dark:bg-zinc-900/60 px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
          Description <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Brief overview of this archetype's target offer or workflow..."
          className="rounded-xl border border-border bg-white/80 dark:bg-zinc-900/60 px-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40 resize-none"
        />
      </div>

      {/* Default Skills Selector with Squishy Badges */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
          Default Skill Stack ({enabledSkills.size}/{SKILLS.length} Enabled)
        </label>
        <div className="flex flex-col gap-1.5">
          {SKILLS.map((skillId) => {
            const isEnabled = enabledSkills.has(skillId);
            const info = SKILL_INFO[skillId];

            return (
              <div
                key={skillId}
                onClick={() => toggleSkill(skillId)}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  isEnabled
                    ? "border-border bg-white dark:bg-zinc-900/80 shadow-2xs"
                    : "border-zinc-200/50 dark:border-zinc-800/40 bg-zinc-50/40 dark:bg-zinc-950/20 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SquishySkillBadge skill={skillId} size={32} enabled={isEnabled} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {info.name}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {info.description}
                    </p>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => {}}
                  className="h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Client Assignment */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
          Assign Clients Now ({selectedClients.size} selected)
        </label>
        {clients.length === 0 ? (
          <p className="text-xs text-zinc-400 font-mono">
            No clients created yet. You can assign clients later.
          </p>
        ) : (
          <div className="max-h-48 overflow-y-auto flex flex-col gap-1 rounded-xl border border-border p-2 bg-white/50 dark:bg-zinc-900/30">
            {clients.map((client) => {
              const isSelected = selectedClients.has(client.engagementId);
              return (
                <label
                  key={client.engagementId}
                  className="flex items-center justify-between rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {client.buyer}
                  </span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleClient(client.engagementId)}
                    className="h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="text-xs font-mono text-rose-500">{error}</p>}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-xs font-bold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isPending ? "Creating Archetype..." : "Create Project"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}