import { describe, it, expect, vi, afterEach } from "vitest";
import http from "http";
import zlib from "zlib";
import type { AddressInfo } from "net";

// The name resolves to a public address when checked, then to this machine
// when the socket connects: a DNS rebinding.
const answers: string[][] = [];
vi.mock("dns/promises", () => {
  const lookup = async () => (answers.shift() ?? ["127.0.0.1"]).map((address) => ({ address, family: 4 }));
  return { lookup, default: { lookup } };
});

import { safeFetch, UnsafeUrlError } from "@/lib/safe-fetch";
import { pinnedRequest } from "@/lib/pinned-request";

let server: http.Server | null = null;
const hits: string[] = [];
async function listen(handler: http.RequestListener): Promise<number> {
  server = http.createServer((req, res) => (hits.push(`${req.method} ${req.url}`), handler(req, res)));
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return (server.address() as AddressInfo).port;
}
afterEach(async () => {
  hits.length = 0;
  answers.length = 0;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

describe("safeFetch", () => {
  it("won't connect when the name rebinds to a private address after the check", async () => {
    const port = await listen((_req, res) => res.end("internal secrets"));
    answers.push(["93.184.216.34"], ["127.0.0.1"]); // the check, then the connection
    await expect(safeFetch(`http://rebind.example:${port}/`)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(hits).toEqual([]);
  });

  it("reads a compressed page and sends a body, like fetch", async () => {
    const port = await listen((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        res.end(zlib.gzipSync(`<p>${req.method} ${body}</p>`));
      });
    });
    const res = await pinnedRequest(new URL(`http://page.test:${port}/x`), { method: "POST", body: "hello" }, new AbortController().signal, () => true);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.text()).toBe("<p>POST hello</p>");
  });
});
