// src/lib/pinned-request.ts
//
// One HTTP request, no redirects followed, whose socket connects only to
// addresses the caller's check approves. The check runs inside the DNS
// lookup the connection itself uses, so a name that resolves differently
// between an earlier check and the connection (DNS rebinding) can't reach
// an address the check would refuse. safe-fetch.ts builds on this.

import { lookup } from "dns/promises";
import http from "http";
import https from "https";
import { Readable } from "stream";
import zlib from "zlib";

export class UnreachableAddressError extends Error {
  constructor() {
    super("That address isn't reachable from here.");
    this.name = "UnsafeUrlError";
  }
}

/** dns.lookup for the socket: resolves, and refuses to connect if any
 * address it would use isn't public. This is the resolution the
 * connection actually uses, so a rebinding answer can't slip past. */
const guardedLookup = (allowed: (ip: string) => boolean) => (hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void): void => {
  lookup(hostname, { all: true, verbatim: true }).then(
    (addresses) => {
      if (addresses.length === 0 || addresses.some((a) => !allowed(a.address))) {
        callback(new UnreachableAddressError());
        return;
      }
      if (options?.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    },
    (err) => callback(err)
  );
};

function decoded(res: http.IncomingMessage): Readable {
  const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return res.pipe(zlib.createGunzip());
  if (encoding === "br") return res.pipe(zlib.createBrotliDecompress());
  if (encoding === "deflate") return res.pipe(zlib.createInflate());
  return res;
}

/** One request, no redirects followed, connecting only to the addresses
 * guardedLookup approved. Answers like fetch does. */
export function pinnedRequest(url: URL, init: RequestInit, signal: AbortSignal, allowed: (ip: string) => boolean): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => (headers[key] = value));
  headers["accept-encoding"] ??= "gzip, deflate, br";
  const body = init.body == null ? null : typeof init.body === "string" ? init.body : init.body instanceof Uint8Array ? Buffer.from(init.body) : null;
  if (init.body != null && body == null) return Promise.reject(new Error("safeFetch sends string or byte bodies only."));

  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(url, { method, headers, lookup: guardedLookup(allowed) as never, signal }, (res) => {
      const status = res.statusCode ?? 502;
      const out = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (Array.isArray(value)) value.forEach((v) => out.append(key, v));
        else if (value != null) out.set(key, String(value));
      }
      // The body below is already decompressed.
      if (res.headers["content-encoding"]) {
        out.delete("content-encoding");
        out.delete("content-length");
      }
      const empty = method === "HEAD" || status === 204 || status === 205 || status === 304;
      if (empty) res.resume();
      const stream = empty ? null : (Readable.toWeb(decoded(res)) as ReadableStream<Uint8Array>);
      resolve(new Response(stream, { status: status < 200 ? 502 : status, statusText: res.statusMessage, headers: out }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}
