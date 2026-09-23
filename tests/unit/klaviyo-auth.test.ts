import { describe, it, expect } from "vitest";
import { klaviyoAuthorization } from "@/lib/klaviyo-auth";

describe("klaviyoAuthorization", () => {
  it("sends a pasted private key with Klaviyo's key prefix", () => {
    expect(klaviyoAuthorization("pk_abc123")).toBe("Klaviyo-API-Key pk_abc123");
  });
  it("sends an OAuth token (a Composio sign-in) as a bearer token", () => {
    expect(klaviyoAuthorization("eyJhbGciOi.token")).toBe("Bearer eyJhbGciOi.token");
  });
});
