"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { LeakMapConfigForm } from "@/components/worker-config-forms/leak-map-config-form";

export default function LeakMapBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return <LeakMapConfigForm engagementId={id} onCancel={() => router.push(`/dashboard/engagements/${id}`)} />;
}
