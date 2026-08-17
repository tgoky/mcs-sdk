// src/app/dashboard/engagements/[id]/bridges/page.tsx
import { redirect } from "next/navigation";

export default async function BridgesIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  // Redirect back to the engagement detail page
  redirect(`/dashboard/engagements/${id}`);
}