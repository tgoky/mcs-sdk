// src/lib/klaviyo-auth.ts
//
// Klaviyo takes two kinds of credential with two different headers: a
// pasted private key ("pk_...") goes as `Klaviyo-API-Key <key>` (Klaviyo's
// OpenAPI spec, securitySchemes), while an OAuth access token, which is
// what a Composio sign-in gives us, goes as `Bearer <token>` (Klaviyo's own
// Node SDK, OAuthSession/OAuthBasicSession). Sending a token with the
// private-key prefix is rejected.

export function klaviyoAuthorization(credential: string): string {
  const value = credential.trim();
  return value.startsWith("pk_") ? `Klaviyo-API-Key ${value}` : `Bearer ${value}`;
}
