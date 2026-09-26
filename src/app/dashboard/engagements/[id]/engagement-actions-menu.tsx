"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings2, KeyRound, Trash2, FileEdit, Share2 } from "lucide-react";
import { ActionMenu, ActionMenuSection, ActionMenuDivider, ActionMenuItem } from "@/components/action-menu";
import { Modal } from "@/components/modal";
import { ApprovalModeToggle } from "./approval-mode/approval-mode-toggle";
import { CallIntelligenceToggle } from "./call-intelligence-toggle";
import { EditStackSettings } from "./edit-stack-settings";
import { UpdateCredentialsForm } from "./update-credentials-form";
import { DeleteClientSection } from "./delete-client-section";
import { ClientDetailsDrawer, type ClientDetailsDrawerData } from "./client-details-drawer";
import type { EngagementStack } from "@/models/schema";
import { useToast } from "@/components/toast/toast-provider";
import { ShareResultsLink } from "./share-results-link";

type ActiveModal = "stack" | "credentials" | "delete" | "details" | "share" | null;

/**
 * Single "Modify" entry point for client configuration: automation mode,
 * stack settings, credentials, call intelligence, client details, and
 * client deletion.
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
  clientDetails,
}: {
  engagementId: string;
  buyerName: string;
  initialStack: EngagementStack | null;
  bookingPlatform?: string | null;
  emailPlatform?: string | null;
  vaultLinksByProvider: Record<string, string | null>;
  initialRequireApproval: boolean;
  initialDeletedAt: string | null;
  clientDetails: Omit<ClientDetailsDrawerData, "engagementId" | "buyer">;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [activeModal, setActiveModal] = useState<ActiveModal>(() => {
    if (searchParams.get("fixCredential") === "1") return "credentials";
    if (searchParams.get("fixSection")) return "stack";
    return null;
  });
  // Set right before opening the stack modal from something already
  // mounted on this page (the Call Intelligence toggle's "Connect"/
  // "Manage" actions) — see EditStackSettings' initialHighlightSection
  // prop for why this can't just reuse the ?fixSection= URL param for
  // same-page opens.
  const [stackHighlightSection, setStackHighlightSection] = useState<string | null>(null);

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

  function openStackSettings(highlightSection?: string) {
    setStackHighlightSection(highlightSection ?? null);
    setActiveModal("stack");
  }

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

            <ActionMenuSection label="Call intelligence">
              <CallIntelligenceToggle
                engagementId={engagementId}
                initialProvider={conversationIntelligenceProvider}
                onManage={() => {
                  openStackSettings("conversation_intelligence");
                  close();
                }}
              />
            </ActionMenuSection>

            <ActionMenuDivider />

            <ActionMenuSection label="Client management">
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
                icon={FileEdit}
                label="Edit client details"
                description="Offer, voice, prospect research, notifications"
                onClick={() => {
                  setActiveModal("details");
                  close();
                }}
              />
              <ActionMenuItem
                icon={Settings2}
                label="Edit stack settings"
                description="Booking, hosting, email, SMS, ad-data"
                onClick={() => {
                  openStackSettings();
                  close();
                }}
              />
              {hasCredentialsForm && (
                <ActionMenuItem
                  icon={KeyRound}
                  label="Update credentials"
                  description="Re-enter a key or link a saved one"
                  onClick={() => {
                    setActiveModal("credentials");
                    close();
                  }}
                />
              )}
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
            initialHighlightSection={stackHighlightSection}
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
        <ClientDetailsDrawer
          data={{ engagementId, buyer: buyerName, ...clientDetails }}
          isOpen
          onClose={() => setActiveModal(null)}
          onSaved={() => {
            toast.success(`${buyerName}'s details saved.`);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
