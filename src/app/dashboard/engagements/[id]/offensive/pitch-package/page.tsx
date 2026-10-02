"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { PitchPackageMove } from "@/features/reputation-manager/offensive-pitch-package";

export default function PitchPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  return <PitchPackageMove id={id} onBack={() => router.push(`/dashboard/engagements/${id}/offensive`)} />;
}
