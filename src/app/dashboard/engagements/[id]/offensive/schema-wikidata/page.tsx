"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { SchemaWikidataMove } from "@/features/reputation-manager/offensive-schema-wikidata";

export default function SchemaWikidataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  return <SchemaWikidataMove id={id} onBack={() => router.push(`/dashboard/engagements/${id}/offensive`)} />;
}
