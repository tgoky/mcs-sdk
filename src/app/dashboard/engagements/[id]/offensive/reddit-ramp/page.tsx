"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { RedditRampMove } from "@/features/reputation-manager/offensive-reddit-ramp";

export default function RedditRampPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  return <RedditRampMove id={id} onBack={() => router.push(`/dashboard/engagements/${id}/offensive`)} />;
}
