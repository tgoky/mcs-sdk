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
 * Single "Edit" entry point for everything that used to be scattered across
 * a standalone Client Management card: the Co-Pilot/Autopilot mode, edit
 * stack settings, update credentials, and delete client. Pause stays
 * outside this menu on purpose (it's the one action people need to reach
 * in a single click without a menu in the way).
 *
 * Clicking "Edit stack settings" / "Update credentials" / "Delete client"
 * opens that form in a Modal rather than cramming it into the dropdown —
 * the dropdown is for choosing an action, not for hosting a multi-section
 * form. Deep links from the failed-run queue (?fixSection=, ?fixCredential=1)
 * still work: they open straight to the right modal on mount.
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
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-1.5 rounded-sm border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all cursor-pointer"
          >
            <SquarePen className="w-3 h-3" /> Edit
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
