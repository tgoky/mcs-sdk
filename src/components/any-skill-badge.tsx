"use client";

import { isRepSkillId } from "@/lib/rep-skill-manifest";
import { RepSkillBadge } from "@/components/rep-skill-badge";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";

/**
 * Renders the right badge for a skillRuns.skillName value regardless of
 * which product it belongs to. SquishySkillBadge only knows Showtime's 5
 * skills (returns null for anything else — see its own SKILL_SQUISHY_CONFIG),
 * which left every Reputation Manager run in the Executions page and live
 * feed with no badge at all. This is the one place that decides which
 * badge component a given skill id gets, instead of every list needing
 * its own isRepSkillId check.
 */
export function AnySkillBadge({
  skill,
  size = 26,
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
      <div className={enabled ? undefined : "opacity-40 grayscale"}>
        <RepSkillBadge skill={skill} size={size} />
      </div>
    );
  }
  return <SquishySkillBadge skill={skill} size={size} enabled={enabled} paused={paused} count={count} />;
}
