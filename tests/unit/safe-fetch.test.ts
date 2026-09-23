import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("dns/promises", () => {
  const lookup = vi.fn();
  return { lookup, default: { lookup } };
});

import { lookup } from "dns/promises";
import { assertPublicUrl, isBlockedAddress, safeFetch, UnsafeUrlError } from "@/lib/safe-fetch";

const resolvesTo = (...addresses: string[]) =>
  vi.mocked(lookup).mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })) as any);

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "104.16.1.1", "2606:4700::1111"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

describe("assertPublicUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses internal hosts before any lookup", async () => {
    await expect(assertPublicUrl("http://localhost:3000/x")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("http://[::1]/")).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses a public-looking name that resolves to a private address", async () => {
    resolvesTo("10.0.0.5");
    await expect(assertPublicUrl("https://sneaky.example.com")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("refuses non-http schemes, credentials, and http when https is required", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("https://user:pw@example.com")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("http://example.com", { httpsOnly: true })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("accepts a public host", async () => {
    resolvesTo("93.184.216.34");
    expect((await assertPublicUrl("https://example.com/hook")).hostname).toBe("example.com");
  });
});

describe("safeFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("checks every redirect hop, so a redirect into the internal network is refused", async () => {
    resolvesTo("93.184.216.34");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("https://example.com")).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a public redirect and returns the final response", async () => {
    resolvesTo("93.184.216.34");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "https://www.example.com/" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await safeFetch("https://example.com")).status).toBe(200);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://www.example.com/");
  });

  it("stops after maxRedirects", async () => {
    resolvesTo("93.184.216.34");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.com/again" } })));
    await expect(safeFetch("https://example.com", {}, { maxRedirects: 0 })).rejects.toThrow("Too many redirects");
  });
});
