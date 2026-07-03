import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { users } from "@/models/schema";

// =============================================================================
// 🔌 UNCOMMENT THIS BLOCK LATER TO WIRE REAL WHOP OAUTH BACK IN:
// =============================================================================
/*
import { cookies } from "next/headers";
import crypto from "crypto";
import { generateAuthUrl } from "@/lib/whop";

export async function GET() {
  const state = crypto.randomBytes(16).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10, // 10 minutes — only needs to survive the redirect round trip
  };
  cookieStore.set("oauth_state", state, cookieOpts);
  cookieStore.set("oauth_nonce", nonce, cookieOpts);
  cookieStore.set("code_verifier", codeVerifier, cookieOpts);

  redirect(generateAuthUrl(state, codeVerifier, nonce));
}
*/
// =============================================================================


// =============================================================================
// 🧪 MOCK BYPASS MODE (Active Sandbox Test Layer)
// =============================================================================
export async function GET() {
  const mockUserId = "user_mock_sandbox_dev";
  const mockEmail = "sandbox@muddventures.com";
  
  // Stamping as "admin" signals to src/middleware.ts that this session is local/exempt
  // and completely bypasses periodic Whop API live background revalidations.
  const mockStatus = "admin"; 

  // 1. Seed or update the mock user within your Postgres database to prevent 
  // relation inconsistencies or empty state scenarios across the workspace panels.
  try {
    await db
      .insert(users)
      .values({
        whopUserId: mockUserId,
        email: mockEmail,
        subscriptionStatus: mockStatus,
      })
      .onConflictDoUpdate({
        target: users.whopUserId,
        set: {
          email: mockEmail,
          subscriptionStatus: mockStatus,
          updatedAt: new Date(),
        },
      });
  } catch (dbErr) {
    console.error("[mock login] Database seeding warning:", dbErr);
  }

  // 2. Direct injection into the encrypted, httpOnly iron-session framework cookie.
  const session = await getSession();
  session.whopUserId = mockUserId;
  session.email = mockEmail;
  session.subscriptionStatus = mockStatus;
  session.subscriptionVerifiedAt = Date.now();
  session.refreshToken = "mock_refresh_token_sandbox";
  await session.save();

  // 3. Auto-route past the Whop external gateway and drop straight into testing flows.
  redirect("/dashboard");
}