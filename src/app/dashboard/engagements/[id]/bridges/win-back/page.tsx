"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { WinBackConfigForm } from "@/components/worker-config-forms/win-back-config-form";

/**
 * Win-Back's hinges panel. Unlike Pin-Down's, this doesn't gate enabling
 * Win-Back — every field defaults to a sane, usable value, so it's
 * reachable anytime from the engagement detail page as a plain
 * review/edit screen, not a required stop before turning Win-Back on.
 */
export default function WinBackBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return <WinBackConfigForm engagementId={id} onCancel={() => router.push(`/dashboard/engagements/${id}`)} />;
}
