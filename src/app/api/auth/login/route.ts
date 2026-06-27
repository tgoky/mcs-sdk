// src/app/api/auth/login/route.ts
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export async function GET() {
  const session = await getSession();
  
  // Directly inject a mock session structure
  session.whopUserId = "dev_sandbox_user";
  session.email = "developer@muddventures.local";
  session.subscriptionStatus = "active";
  await session.save();

  // Route straight into the dashboard
  redirect("/dashboard");
}