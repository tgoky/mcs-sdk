"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, MoreHorizontal, TriangleAlert } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@/components/action-menu";
import { Modal } from "@/components/modal";
import type { Workspace } from "@/lib/workspace";

type ActiveModal = "rename" | "delete" | null;

/**
 * "..." menu in the top-right corner of a /home workspace card (and the
 * matching column in the list view row) — rename and soft-delete, same
 * ActionMenu + Modal wiring as EngagementActionsMenu's "Modify" menu.
 *
 * The trigger needs `relative z-20` plus stopPropagation/preventDefault:
 * on the card it sits on top of the card's own absolute full-card submit
 * button, same reason RunRowActions documents for run rows sitting on top
 * of the row's full-row Link. The list row has no such overlay, but the
 * same handlers are harmless there.
 */
export function WorkspaceCardMenu({
  workspace,
  canDelete,
}: {
  workspace: Workspace;
  canDelete: boolean;
}) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  return (
    <>
      <ActionMenu
        align="end"
        panelWidth={220}
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle();
            }}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={`Actions for ${workspace.name}`}
            className="relative z-20 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
      >
        {(close) => (
          <>
            <ActionMenuItem
              icon={Pencil}
              label="Edit workspace name"
              onClick={() => {
                setActiveModal("rename");
                close();
              }}
            />
            <ActionMenuItem
              icon={Trash2}
              label="Delete workspace"
              description={
                workspace.isLegacy
                  ? "Your default workspace can't be deleted"
                  : !canDelete
                  ? "Create another workspace first"
                  : undefined
              }
              tone="danger"
              disabled={!canDelete}
              onClick={() => {
                setActiveModal("delete");
                close();
              }}
            />
          </>
        )}
      </ActionMenu>

      {activeModal === "rename" && (
        <Modal title="Edit workspace name" icon={Pencil} onClose={() => setActiveModal(null)}>
          <RenameWorkspaceSection workspace={workspace} onRequestClose={() => setActiveModal(null)} />
        </Modal>
      )}

      {activeModal === "delete" && (
        <Modal title="Delete workspace" icon={Trash2} onClose={() => setActiveModal(null)}>
          <DeleteWorkspaceSection workspace={workspace} onRequestClose={() => setActiveModal(null)} />
        </Modal>
      )}
    </>
  );
}

function RenameWorkspaceSection({
  workspace,
  onRequestClose,
}: {
  workspace: Workspace;
  onRequestClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Workspace name is required.");
      return;
    }
    if (trimmed === workspace.name) {
      onRequestClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        onRequestClose();
      } else {
        setError(data.error ?? "Failed to rename workspace.");
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename workspace.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
        Workspace name
      </label>
      <input
        autoFocus
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !busy && save()}
        className="w-full text-sm px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-800 bg-background text-zinc-800 dark:text-zinc-200"
      />
      {error && <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onRequestClose}
          className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer px-2 py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy || !name.trim()}
          className="text-[11px] font-mono font-bold px-3 py-1.5 rounded bg-amber-400 hover:bg-amber-500 text-zinc-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function DeleteWorkspaceSection({
  workspace,
  onRequestClose,
}: {
  workspace: Workspace;
  onRequestClose: () => void;
}) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.workspaceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmWorkspaceName: confirmText }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        onRequestClose();
      } else {
        setError(data.error ?? "Failed to delete workspace.");
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete workspace.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 p-4 space-y-3">
      <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
        <TriangleAlert className="w-3.5 h-3.5" /> Delete {workspace.name}?
      </p>
      <p className="text-[11px] text-rose-600/80 dark:text-rose-400/70 font-mono leading-relaxed">
        This hides the workspace and everything in it — engagements, credentials, run history. Nothing is
        erased, but there&apos;s no restore option for this one yet, so make sure it&apos;s the right
        workspace. Type its name to confirm: <span className="font-bold">{workspace.name}</span>
      </p>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={workspace.name}
          className="flex-1 text-xs font-mono px-2 py-1.5 rounded border border-rose-300 dark:border-rose-900/60 bg-background text-zinc-700 dark:text-zinc-300 placeholder:text-rose-300 dark:placeholder:text-rose-900/60"
          onKeyDown={(e) => e.key === "Enter" && confirmText === workspace.name && confirmDelete()}
        />
        <button
          onClick={confirmDelete}
          disabled={busy || confirmText !== workspace.name}
          className="text-[11px] font-mono font-bold px-3 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
        >
          {busy ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          onClick={onRequestClose}
          className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer shrink-0"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
