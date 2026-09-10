// src/features/cold-open/server/fetchers/base.ts
//
// The LeadFetcher interface + normalized LeadRow schema. Port of the Cold
// Open skill pack's fetchers/base.py. Every lead source implements the
// same three-method contract so Daily Send can iterate `leadSources[]`
// from coldOpenConfig without caring what's behind each entry.
//
// The admin-email deny-list + generic-name inference (email-filters.ts,
// ported as-is) are applied HERE, in the shared normalize step, so every
// source gets them identically.

import { normalizeDomain } from "../url-normalize";
import { screenLeadEmail } from "../email-filters";
import type { ColdOpenLeadSource } from "@/models/schema";

export const LEAD_FIELDS = ["domain", "companyName", "firstName", "lastName", "email", "title", "city", "state", "country", "linkedinUrl", "phone", "icp", "source"] as const;

export interface LeadRow {
  domain: string;
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  city: string;
  state: string;
  country: string;
  linkedinUrl: string;
  phone: string;
  icp: string;
  source: string;
  extra: Record<string, string>;
}

export function emptyLeadRow(): LeadRow {
  return {
    domain: "", companyName: "", firstName: "", lastName: "", email: "", title: "",
    city: "", state: "", country: "", linkedinUrl: "", phone: "", icp: "", source: "", extra: {},
  };
}

export class FetcherError extends Error {}

export interface FetchStats {
  raw: number;
  kept: number;
  droppedAdminEmail: number;
  droppedMissingDomain: number;
  droppedMissingCompany: number;
  deduped: number;
  inferredNames: number;
}

function emptyStats(): FetchStats {
  return { raw: 0, kept: 0, droppedAdminEmail: 0, droppedMissingDomain: 0, droppedMissingCompany: 0, deduped: 0, inferredNames: 0 };
}

/** Common interface. Subclasses implement rawRecords()/mapRecord(); the
 * shared fetch() applies domain cleaning, dedupe, the admin-email
 * deny-list, and name inference identically for every source. */
export abstract class LeadFetcher {
  fetcherType = "base";
  stats: FetchStats = emptyStats();

  constructor(protected cfg: ColdOpenLeadSource) {}

  /** Human-readable config problems ([] = ready to fetch). */
  abstract validateConfig(): Promise<string[]> | string[];

  /** Fetch up to `limit` raw source records. Throws FetcherError. */
  protected abstract rawRecords(limit: number): Promise<Record<string, unknown>[]>;

  /** Map one raw record onto a LeadRow (no filtering — normalize() owns that). */
  protected abstract mapRecord(record: Record<string, unknown>): LeadRow;

  async fetch(limit: number): Promise<LeadRow[]> {
    const raw = await this.rawRecords(limit);
    this.stats.raw = raw.length;
    return this.normalize(raw);
  }

  /** The Source Connect verification pull: small, same code path. */
  async testPull(limit = 3): Promise<LeadRow[]> {
    return this.fetch(limit);
  }

  private normalize(raw: Record<string, unknown>[]): LeadRow[] {
    const seen = new Set<string>();
    const out: LeadRow[] = [];
    for (const record of raw) {
      const row = this.mapRecord(record);
      row.icp = row.icp || this.cfg.icp || "";
      row.source = row.source || this.fetcherType;
      row.domain = normalizeDomain(row.domain || row.email);
      if (!row.domain) {
        this.stats.droppedMissingDomain++;
        continue;
      }
      if (!row.companyName?.trim()) {
        this.stats.droppedMissingCompany++;
        continue;
      }
      if (seen.has(row.domain)) {
        this.stats.deduped++;
        continue;
      }
      seen.add(row.domain);

      const screen = screenLeadEmail(row.email, row.firstName);
      if (screen.drop) {
        this.stats.droppedAdminEmail++;
        continue;
      }
      row.firstName = screen.firstName;
      if (screen.inferred) this.stats.inferredNames++;
      out.push(row);
    }
    this.stats.kept = out.length;
    return out;
  }
}
