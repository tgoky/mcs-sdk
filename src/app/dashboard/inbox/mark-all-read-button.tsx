"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";

export function MarkAllReadButton() {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/notifications/all/read", { method: "POST" });
        if (res.ok) {
          toast.success("All notifications marked as read.");
          router.refresh();
        } else {
          toast.error("Failed to mark notifications as read.");
        }
      } catch {
        toast.error("Failed to mark notifications as read.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors disabled:opacity-50"
    >
      <CheckCheck className="w-3.5 h-3.5" />
      Mark all read
    </button>
  );
}
