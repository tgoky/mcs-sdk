"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { RepOnboardingConfigForm } from "@/components/worker-config-forms/rep-onboarding-config-form";

/**
 * Reputation Manager's hinges panel for a client that already exists —
 * reached from that client's Products panel "Set up" card. Mirrors
 * bridges/pin-down/page.tsx's own shape: GET pre-fills whatever's
 * already saved, POST saves + enables the skill + dispatches the
 * collision-check run.
 */
export default function RepOnboardingBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return <RepOnboardingConfigForm engagementId={id} onCancel={() => router.push(`/dashboard/engagements/${id}`)} />;
}
