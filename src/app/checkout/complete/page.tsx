import { redirect } from "next/navigation";

// Only reached for redirect-based payment methods (3D Secure, certain
// regional methods) — the common in-iframe card completion is handled
// client-side by WhopCheckoutWidget's onComplete instead. See the embed
// docs: check `status` after landing here.
export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  if (status === "error") {
    return (
      <div className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-xl font-semibold mb-2">Payment didn&apos;t go through</h1>
        <p className="text-sm text-zinc-400 mb-6 max-w-sm">
          It was declined or canceled. No charge was made — try again.
        </p>
        <a href="/checkout" className="text-sm underline text-zinc-300 hover:text-white">
          Back to checkout
        </a>
      </div>
    );
  }

  // status === "success" (or missing) — the membership now exists on
  // Whop's side. Hand off to the existing OAuth login to actually
  // establish this app's session.
  redirect("/api/auth/login?redirect_to=/home");
}
