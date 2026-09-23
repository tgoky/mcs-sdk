// src/lib/account-intel/reader.ts
//
// One GET/POST at a time against a vendor, recording what could be read
// and what the connection isn't allowed to see. A blocked or failed part
// never stops the rest of the pull; it's listed so the screen can say so
// instead of pretending the account had nothing.

import { fetchWithTimeout } from "@/lib/http";

/** A vendor's JSON, read field by field with fallbacks (every read below
 * guards for missing or differently shaped fields). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Raw = any;

export class AccountReader {
  readonly read = new Set<string>();
  readonly blocked = new Set<string>();
  readonly failed = new Set<string>();
  private readonly deadline: number;

  constructor(
    private readonly headers: Record<string, string>,
    budgetMs = 40_000
  ) {
    this.deadline = Date.now() + budgetMs;
  }

  get outOfTime(): boolean {
    return Date.now() >= this.deadline;
  }

  async json<T = Raw>(part: string, url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T | null> {
    if (this.outOfTime) {
      this.failed.add(part);
      return null;
    }
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: init.method ?? "GET",
          headers: { Accept: "application/json", ...this.headers, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
          body: init.body ? JSON.stringify(init.body) : undefined,
        },
        Math.max(1000, Math.min(12_000, this.deadline - Date.now()))
      );
      if (res.status === 401 || res.status === 403) {
        this.blocked.add(part);
        return null;
      }
      if (!res.ok) {
        this.failed.add(part);
        return null;
      }
      const data = (await res.json()) as T;
      this.read.add(part);
      return data;
    } catch {
      this.failed.add(part);
      return null;
    }
  }

  coverage(): { read: string[]; blocked: string[]; failed: string[] } {
    const read = [...this.read];
    return {
      read,
      blocked: [...this.blocked].filter((p) => !this.read.has(p)),
      failed: [...this.failed].filter((p) => !this.read.has(p) && !this.blocked.has(p)),
    };
  }
}

/** Runs fn over items with at most `limit` in flight. */
export async function inBatches<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}
