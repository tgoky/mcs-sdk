"use client";

// "Grow your reputation" inside the right-hand pane (see
// components/skill-settings/skill-settings-pane.tsx): the three steps, and
// whichever one is opened, switch in place instead of leaving the page. The
// same content is still available as pages under .../offensive.

import { useState } from "react";
import { OffensivePlaybook, type OffensiveMoveSlug } from "@/features/reputation-manager/offensive-playbook";
import { SchemaWikidataMove } from "@/features/reputation-manager/offensive-schema-wikidata";
import { PitchPackageMove } from "@/features/reputation-manager/offensive-pitch-package";
import { RedditRampMove } from "@/features/reputation-manager/offensive-reddit-ramp";

export function GrowPanel({ engagementId }: { engagementId: string }) {
  const [move, setMove] = useState<OffensiveMoveSlug | null>(null);
  const back = () => setMove(null);

  return (
    // Keyed so switching steps starts at the top.
    <div key={move ?? "index"} className="h-full overflow-y-auto p-4">
      {move === "schema-wikidata" ? (
        <SchemaWikidataMove id={engagementId} onBack={back} embedded />
      ) : move === "pitch-package" ? (
        <PitchPackageMove id={engagementId} onBack={back} embedded />
      ) : move === "reddit-ramp" ? (
        <RedditRampMove id={engagementId} onBack={back} embedded />
      ) : (
        <OffensivePlaybook id={engagementId} onOpenMove={setMove} />
      )}
    </div>
  );
}
