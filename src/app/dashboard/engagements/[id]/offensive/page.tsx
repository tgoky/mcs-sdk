"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { OffensivePlaybook } from "@/features/reputation-manager/offensive-playbook";

export default function OffensivePlaybookIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  return <OffensivePlaybook id={id} onBack={() => router.push(`/dashboard/engagements/${id}`)} />;
}
