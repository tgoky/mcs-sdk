"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EditStackSettings } from "@/app/dashboard/engagements/[id]/edit-stack-settings";
import { UpdateCredentialsForm } from "@/app/dashboard/engagements/[id]/update-credentials-form";
import { Settings2, KeyRound, Loader2 } from "lucide-react";
import type { EngagementStack } from "@/models/schema";

interface QueueFixDrawerProps {
  engagementId: string | null;
  type: "stack" | "credentials" | null;
  section?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function QueueFixDrawer({
  engagementId,
  type,
  section,
  isOpen,
  onClose,
  onSuccess,
}: QueueFixDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState<EngagementStack | null>(null);
  const [buyer, setBuyer] = useState<string | null>(null);
  const [vaultLinksByProvider, setVaultLinksByProvider] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !engagementId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/engagements/${engagementId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load client configuration.");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const eng = data.engagement ?? data;
        setStack(eng.stack ?? null);
        setBuyer(eng.buyer ?? null);
        setVaultLinksByProvider(data.vaultLinksByProvider ?? {});
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load client configuration.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, engagementId]);

  // Reset when drawer closes so stale data never flashes on reopen
  useEffect(() => {
    if (!isOpen) {
      setLoading(true);
      setStack(null);
      setBuyer(null);
      setVaultLinksByProvider({});
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !engagementId || !type) return null;

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
           <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 font-sans">
        <div className="p-6 space-y-5">
          <SheetHeader className="space-y-1.5">
            <SheetTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              {type === "credentials" ? (
                <>
                  <KeyRound className="w-4 h-4 text-amber-500" />
                  Update Credentials{buyer ? ` for ${buyer}` : ""}
                </>
              ) : (
                <>
                  <Settings2 className="w-4 h-4 text-sky-500" />
                  Stack Settings{buyer ? ` for ${buyer}` : ""}
                </>
              )}
            </SheetTitle>
          </SheetHeader>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 space-y-3">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
              <p className="text-xs font-mono">Loading configuration...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 text-xs font-mono text-rose-600 dark:text-rose-400">
              {error}
            </div>
          ) : type === "credentials" ? (
            <UpdateCredentialsForm
              engagementId={engagementId}
              bookingPlatform={stack?.booking_platform ?? null}
              emailPlatform={stack?.email_platform ?? null}
              conversationIntelligenceProvider={stack?.conversation_intelligence_provider ?? null}
              vaultLinksByProvider={vaultLinksByProvider}
              embedded
              onRequestClose={handleSuccess}
            />
          ) : (
            <EditStackSettings
              engagementId={engagementId}
              initialStack={stack}
              embedded
              initialHighlightSection={section ?? null}
              onRequestClose={handleSuccess}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}