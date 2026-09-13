"use client";

// src/app/dashboard/engagements/[id]/pile-on-configure-button.tsx
//
// Pile-On has no "hinges panel" (worker.hasHingesPanel is false — see
// skill-manifest.ts) so it never got the SkillConfigureMenu/FloatingPanel
// treatment every other skill's own page has. Its only settings UI was
// EnablePileOnModal, which is enable-only: no way to reopen it once
// Pile-On was already on. This reuses that same modal (now with a
// configureMode) and the same enable-with-config endpoint (already safe
// to call again — it merges into the existing stack, and re-enabling an
// already-enabled worker is a no-op) instead of building a second form.

import { useState } from "react";
import { Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { EnablePileOnModal } from "@/components/library/enable-worker-modal";

export function PileOnConfigureButton({
  engagementId,
  buyerName,
  initialSmsPlatform,
  initialAdDataPlatform,
}: {
  engagementId: string;
  buyerName?: string | null;
  initialSmsPlatform: string;
  initialAdDataPlatform: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Configure"
        title="Configure"
        className="hover-lift press-settle flex items-center justify-center rounded-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 w-8 h-8 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
      >
        <Settings size={17} />
      </button>

      {open && (
        <EnablePileOnModal
          engagementId={engagementId}
          buyerName={buyerName ?? undefined}
          configureMode
          initialSmsPlatform={initialSmsPlatform}
          initialAdDataPlatform={initialAdDataPlatform}
          onClose={() => setOpen(false)}
          onEnabled={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
