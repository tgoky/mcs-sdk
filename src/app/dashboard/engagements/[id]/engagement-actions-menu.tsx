"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { SquarePen, Settings2, KeyRound, Trash2 } from "lucide-react";
import { ActionMenu, ActionMenuSection, ActionMenuDivider, ActionMenuItem } from "@/components/action-menu";
import { Modal } from "@/components/modal";
import { ApprovalModeToggle } from "./approval-mode/approval-mode-toggle";
import { EditStackSettings } from "./edit-stack-settings";
import { UpdateCredentialsForm } from "./update-credentials-form";
import { DeleteClientSection } from "./delete-client-section";
import type { EngagementStack } from "@/models/schema";

type ActiveModal = "stack" | "credentials" | "delete" | null;

/**
 * Single "Modify" entry point for client configuration: automation mode,
 * stack settings, credentials, and client deletion.
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
}: {
  engagementId: string;
  buyerName: string;
  initialStack: EngagementStack | null;
  bookingPlatform?: string | null;
  emailPlatform?: string | null;
  vaultLinksByProvider: Record<string, string | null>;
  initialRequireApproval: boolean;
  initialDeletedAt: string | null;
}) {
  const searchParams = useSearchParams();
  const [activeModal, setActiveModal] = useState<ActiveModal>(() => {
    if (searchParams.get("fixCredential") === "1") return "credentials";
    if (searchParams.get("fixSection")) return "stack";
    return null;
  });

  const hasCredentialsForm = Boolean(bookingPlatform || emailPlatform);

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
            className="inline-flex items-center gap-2.5 text-sm font-semibold px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/90 text-zinc-800 dark:text-zinc-200 transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <SquarePen className="w-4.5 h-4.5 text-zinc-500 dark:text-zinc-400" />
            <span>Modify</span>
          </button>
        )}
      >
        {(close) => (
          <>
            <ActionMenuSection label="Automation mode">
              <ApprovalModeToggle engagementId={engagementId} initialRequireApproval={initialRequireApproval} />
            </ActionMenuSection>

            <ActionMenuDivider />

            <ActionMenuSection label="Client management">
              <ActionMenuItem
                icon={Settings2}
                label="Edit stack settings"
                description="Booking, hosting, email, SMS, ad-data"
                onClick={() => {
                  setActiveModal("stack");
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
                description={initialDeletedAt ? "Deleted — restore from here" : "Hides the client, pauses everything"}
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
          />
        </Modal>
      )}

      {activeModal === "credentials" && hasCredentialsForm && (
        <Modal title="Update credentials" icon={KeyRound} onClose={() => setActiveModal(null)}>
          <UpdateCredentialsForm
            engagementId={engagementId}
            bookingPlatform={bookingPlatform}
            emailPlatform={emailPlatform}
            vaultLinksByProvider={vaultLinksByProvider}
            embedded
            onRequestClose={() => setActiveModal(null)}
          />
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
    </>
  );
}