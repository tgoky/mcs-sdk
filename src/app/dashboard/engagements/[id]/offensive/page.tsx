"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileJson, Mail, MessageSquare, ChevronLeft } from "lucide-react";

type ChecklistItem = { key: string; label: string; completed: boolean; completedAt: string | null };

const MOVES = [
  {
    move: "a" as const,
    slug: "schema-wikidata",
    name: "Tell Google who you are",
    description: "Get a ready-made snippet for your website plus a guide for a Wikidata page, so Google and AI assistants link your name to your real profiles.",
    icon: FileJson,
  },
  {
    move: "b" as const,
    slug: "pitch-package",
    name: "Get featured in the press",
    description: "List the publications worth pitching, draft a short pitch for each, and track who replied and who ran a story.",
    icon: Mail,
  },
  {
    move: "c" as const,
    slug: "reddit-ramp",
    name: "Build a presence on Reddit",
    description: "A 90-day plan to become a trusted voice in the subreddits your buyers read: where to post, how often, and when.",
    icon: MessageSquare,
  },
];

function progressLabel(items: ChecklistItem[] | undefined): string {
  if (!items) return "Not started";
  const done = items.filter((i) => i.completed).length;
  return `${done}/${items.length}`;
}

/**
 * Move A/B/C's index — the offensive/ playbook from mcs/cms, ported
 * alongside the defensive monitoring skills. Every move here is
 * operator-executed: this app generates, drafts, and tracks; it never
 * auto-sends an email or auto-posts to Reddit (see each move's own server
 * module for why that boundary matters).
 */
export default function OffensivePlaybookIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [progress, setProgress] = useState<Record<string, ChecklistItem[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        MOVES.map(async ({ move }) => {
          const res = await fetch(`/api/engagements/${id}/offensive/checklist/${move}`);
          if (!res.ok) return [move, [] as ChecklistItem[]] as const;
          const data = await res.json();
          return [move, data.items ?? []] as const;
        })
      );
      if (!cancelled) setProgress(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-6">
      <button
        onClick={() => router.push(`/dashboard/engagements/${id}`)}
        className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
      >
        <ChevronLeft size={14} />
        Back to engagement
      </button>

      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Grow your reputation</h1>
        <p className="text-[15px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
          Monitoring tells you what people and AI assistants already say about you. These three steps help you change it. We prepare the material. You do the posting and sending yourself, and tick off each step as you go.
        </p>
      </div>

      <div className="space-y-3">
        {MOVES.map(({ move, slug, name, description, icon: Icon }) => (
          <Link
            key={move}
            href={`/dashboard/engagements/${id}/offensive/${slug}`}
            className="group flex items-start gap-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/60 p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-2xs"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  {name}
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0">
                  {progressLabel(progress[move])}
                </span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
