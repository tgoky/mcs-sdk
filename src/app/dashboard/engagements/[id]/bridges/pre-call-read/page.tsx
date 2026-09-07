"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { PreCallReadConfigForm } from "@/components/worker-config-forms/pre-call-read-config-form";

export default function PreCallReadBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return <PreCallReadConfigForm engagementId={id} onCancel={() => router.push(`/dashboard/engagements/${id}`)} />;
}
