// src/features/cold-open/server/fetchers/csv.ts
//
// The universal fallback: buyer pastes/uploads a file. Port of the Cold
// Open skill pack's fetchers/csv.py, adapted to read from the config's
// stored csvContent text (see ColdOpenLeadSource's own comment in
// schema.ts) instead of a local file path — this app has no per-engagement
// filesystem the way a buyer-run Claude session does.
//
// csvMapping maps LeadRow fields -> the buyer's own column headers. email
// and companyName are required; domain falls back to the email's domain
// when unmapped. Unmapped extra columns land in row.extra verbatim.

import { LeadFetcher, emptyLeadRow, FetcherError, type LeadRow } from "./base";

const REQUIRED_MAPPED = ["email", "companyName"] as const;

/** Minimal RFC4180-ish CSV parser: handles quoted fields (with embedded
 * commas/newlines) and "" as an escaped quote. Good enough for the small,
 * hand-exported lead lists this fetcher is meant for — not a general CSV
 * library replacement. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function toRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((r) => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = r[idx] ?? "";
    });
    return record;
  });
}

export class CsvFetcher extends LeadFetcher {
  fetcherType = "csv";

  validateConfig(): string[] {
    const problems: string[] = [];
    const content = this.cfg.csvContent;
    if (!content || !content.trim()) {
      problems.push("csv source needs csvContent (paste or upload a CSV) — no file is stored yet.");
      return problems;
    }
    const mapping = this.cfg.csvMapping ?? {};
    for (const field of REQUIRED_MAPPED) {
      if (!mapping[field]) problems.push(`csv mapping missing required field '${field}'`);
    }
    const headers = parseCsv(content)[0] ?? [];
    for (const [fieldName, col] of Object.entries(mapping)) {
      if (col && !headers.includes(col)) problems.push(`mapped column '${col}' (for ${fieldName}) not in the file's headers: ${headers.join(", ")}`);
    }
    return problems;
  }

  protected async rawRecords(limit: number): Promise<Record<string, unknown>[]> {
    const content = this.cfg.csvContent;
    if (!content) throw new FetcherError("no csvContent configured for this source");
    let records: Record<string, string>[];
    try {
      records = toRecords(parseCsv(content));
    } catch (err) {
      throw new FetcherError(`could not parse csv: ${err instanceof Error ? err.message : String(err)}`);
    }
    return limit ? records.slice(0, limit) : records;
  }

  protected mapRecord(record: Record<string, unknown>): LeadRow {
    const mapping = this.cfg.csvMapping ?? {};
    const row = emptyLeadRow();
    const mappedCols = new Set<string>();

    const fieldToColKey: Record<string, keyof LeadRow> = {
      domain: "domain", companyName: "companyName", firstName: "firstName", lastName: "lastName",
      email: "email", title: "title", city: "city", state: "state", country: "country",
      linkedinUrl: "linkedinUrl", phone: "phone", icp: "icp", source: "source",
    };

    for (const [fieldName, rowKey] of Object.entries(fieldToColKey)) {
      const col = mapping[fieldName];
      if (col) {
        (row[rowKey] as string) = String(record[col] ?? "").trim();
        mappedCols.add(col);
      }
    }

    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!mappedCols.has(key) && String(value ?? "").trim()) extra[key] = String(value);
    }
    row.extra = extra;
    return row;
  }
}
