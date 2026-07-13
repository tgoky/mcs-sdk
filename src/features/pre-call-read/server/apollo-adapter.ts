/**
 * Apollo / PDL BYOK (bring-your-own-key) enrichment — Pre-Call Read
 * recovery gap 5.
 *
 * The AI Architect Review's platform-level enrichment key recommendation
 * (UTP pays for and operates one shared enrichment provider) is the
 * stronger long-term direction for the VC-portfolio wedge — it means
 * every operator gets enrichment without needing their own paid data
 * account. This module is the OTHER half the transfer analysis calls for:
 * an operator whose buyer already has their own Apollo or PDL
 * subscription can layer it on top instead of (or in addition to)
 * whatever platform default exists later. The two are additive, not
 * competing — this module only activates when
 * stack.prospect_research_sources_used explicitly includes the source AND
 * a credential is on file, so it never silently starts billing a buyer's
 * Apollo account without the operator opting in per-engagement.
 *
 * Only ever called for prospects that already passed the Rule 14 identity
 * gate — same rule prospect-research.ts follows — since these are paid
 * lookups per the transfer analysis's explicit "never charges the buyer
 * for a new subscription" principle: it's the buyer's own account being
 * billed by its usual per-lookup cost, so this app should be exactly as
 * disciplined about not burning lookups on unconfirmed identities as it
 * is about the free web-search path.
 */

export interface EnrichmentResult {
  source: "apollo" | "pdl";
  found: boolean;
  title?: string;
  companyName?: string;
  companySize?: string;
  companyIndustry?: string;
  seniority?: string;
  summary: string;
}

export async function enrichViaApollo(apiKey: string, email: string): Promise<EnrichmentResult> {
  try {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      return { source: "apollo", found: false, summary: `Apollo lookup failed [${res.status}]` };
    }
    const data = await res.json();
    const person = data.person;
    if (!person) {
      return { source: "apollo", found: false, summary: "No Apollo match for this email." };
    }
    const parts: string[] = [];
    if (person.title) parts.push(`Title: ${person.title}`);
    if (person.organization?.name) parts.push(`Company: ${person.organization.name}`);
    if (person.organization?.estimated_num_employees) parts.push(`Company size: ~${person.organization.estimated_num_employees} employees`);
    if (person.organization?.industry) parts.push(`Industry: ${person.organization.industry}`);
    if (person.seniority) parts.push(`Seniority: ${person.seniority}`);

    return {
      source: "apollo",
      found: true,
      title: person.title,
      companyName: person.organization?.name,
      companySize: person.organization?.estimated_num_employees ? String(person.organization.estimated_num_employees) : undefined,
      companyIndustry: person.organization?.industry,
      seniority: person.seniority,
      summary: parts.length > 0 ? parts.join(". ") : "Apollo match found but no usable fields returned.",
    };
  } catch (e: any) {
    return { source: "apollo", found: false, summary: `Apollo lookup error: ${e.message}` };
  }
}

export async function enrichViaPdl(apiKey: string, email: string): Promise<EnrichmentResult> {
  try {
    const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?email=${encodeURIComponent(email)}`, {
      headers: { "X-Api-Key": apiKey },
    });
    if (!res.ok) {
      return { source: "pdl", found: false, summary: `PDL lookup failed [${res.status}]` };
    }
    const data = await res.json();
    const person = data.data;
    if (!person) {
      return { source: "pdl", found: false, summary: "No PDL match for this email." };
    }
    const parts: string[] = [];
    if (person.job_title) parts.push(`Title: ${person.job_title}`);
    if (person.job_company_name) parts.push(`Company: ${person.job_company_name}`);
    if (person.job_company_size) parts.push(`Company size: ${person.job_company_size}`);
    if (person.job_company_industry) parts.push(`Industry: ${person.job_company_industry}`);

    return {
      source: "pdl",
      found: true,
      title: person.job_title,
      companyName: person.job_company_name,
      companySize: person.job_company_size,
      companyIndustry: person.job_company_industry,
      summary: parts.length > 0 ? parts.join(". ") : "PDL match found but no usable fields returned.",
    };
  } catch (e: any) {
    return { source: "pdl", found: false, summary: `PDL lookup error: ${e.message}` };
  }
}

/**
 * Runs whichever BYOK sources the operator configured for this
 * engagement, in parallel, and returns only the ones that actually found
 * something — merged into prospect-research.ts's web-search summary
 * rather than replacing it, since a paid enrichment hit and a public web
 * search surface genuinely different, complementary information (title/
 * company firmographics vs. recent public activity).
 */
export async function runConfiguredEnrichment(
  sources: Array<"apollo" | "pdl"> | undefined,
  credentials: { apollo?: string; pdl?: string },
  email: string
): Promise<EnrichmentResult[]> {
  if (!sources || sources.length === 0) return [];

  const jobs: Promise<EnrichmentResult>[] = [];
  if (sources.includes("apollo") && credentials.apollo) jobs.push(enrichViaApollo(credentials.apollo, email));
  if (sources.includes("pdl") && credentials.pdl) jobs.push(enrichViaPdl(credentials.pdl, email));

  const results = await Promise.allSettled(jobs);
  return results
    .filter((r): r is PromiseFulfilledResult<EnrichmentResult> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => r.found);
}
