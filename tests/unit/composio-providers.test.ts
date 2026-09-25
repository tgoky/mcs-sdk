import { describe, it, expect, vi, afterEach } from "vitest";

// Sign in only works where Composio has an OAuth app to send the person to:
// its own (managed) or ours, registered as a custom auth config. Klaviyo
// and HighLevel have no managed app, so Sign in must stay hidden for them
// until our own auth config id is set.

async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("@/lib/composio-providers");
}

describe("composio providers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("offers Sign in only for toolkits Composio manages", async () => {
    const m = await load({ NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_KLAVIYO: "", NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_HIGHLEVEL: "" });
    for (const p of ["calendly", "hubspot", "mailchimp", "slack"]) expect(m.isComposioManagedProvider(p)).toBe(true);
    expect(m.isComposioManagedProvider("klaviyo")).toBe(false);
    expect(m.isComposioManagedProvider("ghl_calendar")).toBe(false);
    expect(m.isComposioManagedProvider("activecampaign")).toBe(false);
  });

  it("offers Sign in for Klaviyo and GoHighLevel once our own auth config is set", async () => {
    const m = await load({ NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_KLAVIYO: " ac_klav ", NEXT_PUBLIC_COMPOSIO_AUTH_CONFIG_HIGHLEVEL: "ac_ghl" });
    expect(m.isComposioManagedProvider("klaviyo")).toBe(true);
    expect(m.customAuthConfigIdForProvider("klaviyo")).toBe("ac_klav");
    // GoHighLevel's booking credential maps to Composio's "highlevel" toolkit.
    expect(m.isComposioManagedProvider("ghl_calendar")).toBe(true);
    expect(m.customAuthConfigIdForProvider("ghl_calendar")).toBe("ac_ghl");
  });

  it("has no custom auth config for a provider outside Composio", async () => {
    const m = await load();
    expect(m.customAuthConfigIdForProvider("smtp")).toBeNull();
    expect(m.toolkitSlugForProvider("smtp")).toBeNull();
  });
});
