"use client";

import { isRepSkillId } from "@/lib/rep-skill-manifest";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { RepSkillBadge } from "@/components/rep-skill-badge";

/**
 * Badge for a skillRuns.skillName value from EITHER product's catalog —
 * the badge-rendering counterpart to anySkillDisplayName (lib/any-skill.ts).
 * SquishySkillBadge only knows Showtime's 5 ids and silently renders
 * nothing for anything else, which is exactly what happened to
 * Reputation Manager runs in the shared engagement page's Run History
 * list before this existed.
 *
 * `count` mirrors SquishySkillBadge's own small corner-overlay (used by
 * the Executions page's "runs by skill" gallery) — RepSkillBadge has no
 * equivalent built in, so the Reputation Manager branch renders its own
 * copy of the same overlay rather than growing RepSkillBadge a prop only
 * this one caller needs.
 */
export function AnySkillBadge({
  skill,
  size = 20,
  enabled = true,
  paused = false,
  count,
}: {
  skill: string;
  size?: number;
  enabled?: boolean;
  paused?: boolean;
  count?: number;
}) {
  if (isRepSkillId(skill)) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <RepSkillBadge skill={skill} size={size} />
        {Boolean(count) && (
          <span
            className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-mono font-bold leading-none ring-2 ring-white dark:ring-zinc-950"
            aria-hidden="true"
          >
            {count! > 99 ? "99+" : count}
          </span>
        )}
      </div>
    );
  }
  return <SquishySkillBadge skill={skill} size={size} enabled={enabled} paused={paused} count={count} />;
}
