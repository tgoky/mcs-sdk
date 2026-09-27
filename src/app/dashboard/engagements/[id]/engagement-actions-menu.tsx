"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import { Settings2, KeyRound, Trash2, FileEdit, Share2, Pause, Play } from "lucide-react";
import { ActionMenu, ActionMenuSection, ActionMenuDivider, ActionMenuItem } from "@/components/action-menu";
import { Modal } from "@/components/modal";
import { ApprovalModeToggle } from "./approval-mode/approval-mode-toggle";
import { EditStackSettings } from "./edit-stack-settings";
import { UpdateCredentialsForm } from "./update-credentials-form";
import { DeleteClientSection } from "./delete-client-section";
import { ClientDetailsForm } from "./client-details-form";
import type { EngagementStack } from "@/models/schema";
import { ShareResultsLink } from "./share-results-link";

type ActiveModal = "stack" | "credentials" | "delete" | "details" | "share" | null;

/**
 * "Modify" holds what belongs to the client as a whole: automation mode,
 * its details (name, website, time zone), the results link, and deletion.
 * Product and tool settings live in each product's setup and each skill's
 * settings. The stack and credentials modals still open from links that
 * carry ?fixSection= or ?fixCredential=1 (deliverables, connect menus).
 */
export function EngagementActionsMenu({
  engagementId,
  buyerName,
  initialStack,
  bookingPlatform,
  emailPlatform,
  vaultLinksByProvider,
  initialRequireApproval,
  initialDeletedAt,
  initialPausedAt = null,
}: {
  engagementId: string;
  buyerName: string;
  initialStack: EngagementStack | null;
  bookingPlatform?: string | null;
  emailPlatform?: string | null;
  vaultLinksByProvider: Record<string, string | null>;
  initialRequireApproval: boolean;
  initialDeletedAt: string | null;
  initialPausedAt?: string | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const paused = Boolean(initialPausedAt);

  async function togglePause() {
    const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}/pause`, paused
      ? { method: "DELETE" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: null }) }
    ).catch(() => null);
    if (!res?.ok) return toast.error(paused ? "Couldn't resume." : "Couldn't pause.");
    toast.success(paused ? `${buyerName} resumed.` : `Everything for ${buyerName} is paused.`);
    router.refresh();
  }
  const [activeModal, setActiveModal] = useState<ActiveModal>(() => {
    if (searchParams.get("fixCredential") === "1") return "credentials";
    if (searchParams.get("fixSection")) return "stack";
    return null;
  });

  const conversationIntelligenceProvider = initialStack?.conversation_intelligence_provider ?? null;
  const hostingPlatform = initialStack?.hosting_platform ?? null;
  const smsPlatform = initialStack?.sms_platform ?? null;
  const adDataPlatform = initialStack?.ad_data_platform ?? null;
  const hasCredentialsForm = Boolean(
    bookingPlatform ||
      emailPlatform ||
      conversationIntelligenceProvider === "recall_ai" ||
      hostingPlatform ||
      (smsPlatform && smsPlatform !== "none") ||
      (adDataPlatform && adDataPlatform !== "none")
  );

  return (
    <>
      <ActionMenu
        align="end"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={`Modify settings for ${buyerName}`}
            title="Modify"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/90 text-zinc-500 dark:text-zinc-400 transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <Settings2 className="w-4.5 h-4.5" />
          </button>
        )}
      >
        {(close) => (
          <>
            <ActionMenuSection label="Automation mode">
              <ApprovalModeToggle
                engagementId={engagementId}
                initialRequireApproval={initialRequireApproval}
                initialActionTypes={initialStack?.require_approval_action_types ?? []}
              />
            </ActionMenuSection>

            <ActionMenuDivider />

            <ActionMenuSection label="Client">
              <ActionMenuItem
                icon={paused ? Play : Pause}
                label={paused ? "Resume everything" : "Pause everything"}
                description={paused ? "Every product picks up where it stopped" : "Stops every skill for this client until you resume"}
                onClick={() => {
                  close();
                  void togglePause();
                }}
              />
              <ActionMenuItem
                icon={FileEdit}
                label="Edit client details"
                description="Name, website, time zone, Queue pinning"
                onClick={() => {
                  setActiveModal("details");
                  close();
                }}
              />
              <ActionMenuItem
                icon={Share2}
                label="Share results link"
                description="A page the client opens without signing in"
                onClick={() => {
                  setActiveModal("share");
                  close();
                }}
              />
              <ActionMenuItem
                icon={Trash2}
                label="Delete client"
                description={initialDeletedAt ? "Deleted. Restore from here" : "Hides the client, pauses everything"}
                tone="danger"
                onClick={() => {
                  setActiveModal("delete");
                  close();
                }}
              />
            </ActionMenuSection>
          </>
        )}
      </ActionMenu>

      {activeModal === "stack" && (
        <Modal title="Edit stack settings" icon={Settings2} onClose={() => setActiveModal(null)} maxWidthClass="max-w-2xl">
          <EditStackSettings
            engagementId={engagementId}
            initialStack={initialStack}
            embedded
            onRequestClose={() => setActiveModal(null)}
            initialHighlightSection={searchParams.get("fixSection")}
          />
        </Modal>
      )}

      {activeModal === "credentials" && hasCredentialsForm && (
        <Modal title="Update credentials" icon={KeyRound} onClose={() => setActiveModal(null)}>
          <UpdateCredentialsForm
            engagementId={engagementId}
            bookingPlatform={bookingPlatform}
            emailPlatform={emailPlatform}
            conversationIntelligenceProvider={conversationIntelligenceProvider}
            hostingPlatform={hostingPlatform}
            smsPlatform={smsPlatform}
            adDataPlatform={adDataPlatform}
            vaultLinksByProvider={vaultLinksByProvider}
            embedded
            onRequestClose={() => setActiveModal(null)}
          />
        </Modal>
      )}

      {activeModal === "share" && (
        <Modal title="Share results link" icon={Share2} onClose={() => setActiveModal(null)}>
          <ShareResultsLink engagementId={engagementId} buyerName={buyerName} />
        </Modal>
      )}

      {activeModal === "delete" && (
        <Modal title="Delete client" icon={Trash2} onClose={() => setActiveModal(null)}>
          <DeleteClientSection
            engagementId={engagementId}
            buyerName={buyerName}
            initialDeletedAt={initialDeletedAt}
            embedded
            onRequestClose={() => setActiveModal(null)}
          />
        </Modal>
      )}

      {activeModal === "details" && (
        <Modal title="Client details" icon={FileEdit} onClose={() => setActiveModal(null)}>
          <ClientDetailsForm engagementId={engagementId} onClose={() => setActiveModal(null)} />
        </Modal>
      )}
    </>
  );
}
