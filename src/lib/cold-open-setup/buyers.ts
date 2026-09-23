// src/lib/cold-open-setup/buyers.ts
//
// Who actually buys, from the CRM: the companies behind won deals, with
// their industry and headcount. Evidence for Cold Open's ICPs and sizing
// instead of a guess from the website. HubSpot only for now, using the
// endpoints in HubSpot's public API spec collection:
//   POST /crm/v3/objects/deals/search                         won deals
//   POST /crm/v4/associations/deals/companies/batch/read      their companies
//   POST /crm/v3/objects/companies/batch/read                 industry, headcount
// Needs the deals and companies read scopes; without them it reports what
// it couldn't read and returns nothing.

import { AccountReader, type Raw } from "@/lib/account-intel/reader";
import { buyerProfile, type BuyerCompany, type BuyerProfile } from "./analyze";

const API = "https://api.hubapi.com";

export async function pullHubSpotBuyers(token: string): Promise<{ profile: BuyerProfile | null; coverage: ReturnType<AccountReader["coverage"]> }> {
  const r = new AccountReader({ Authorization: `Bearer ${token}` });
  const deals = await r.json<Raw>("won deals", `${API}/crm/v3/objects/deals/search`, {
    method: "POST",
    body: {
      filterGroups: [{ filters: [{ propertyName: "hs_is_closed_won", operator: "EQ", value: "true" }] }],
      properties: ["closedate", "amount"],
      sorts: [{ propertyName: "closedate", direction: "DESCENDING" }],
      limit: 100,
    },
  });
  const dealIds: string[] = (deals?.results ?? []).map((d: Raw) => String(d.id));
  if (dealIds.length === 0) return { profile: null, coverage: r.coverage() };

  const assoc = await r.json<Raw>("deal companies", `${API}/crm/v4/associations/deals/companies/batch/read`, {
    method: "POST",
    body: { inputs: dealIds.map((id) => ({ id })) },
  });
  const companyIds = [...new Set<string>((assoc?.results ?? []).flatMap((row: Raw) => (row.to ?? []).map((t: Raw) => String(t.toObjectId))))].slice(0, 100);
  if (companyIds.length === 0) return { profile: null, coverage: r.coverage() };

  const companies = await r.json<Raw>("companies", `${API}/crm/v3/objects/companies/batch/read`, {
    method: "POST",
    body: { properties: ["name", "industry", "numberofemployees"], inputs: companyIds.map((id) => ({ id })) },
  });
  const rows: BuyerCompany[] = (companies?.results ?? []).map((c: Raw) => {
    const p = c.properties ?? {};
    const employees = Number(p.numberofemployees);
    return { name: p.name ?? null, industry: p.industry ?? null, employees: Number.isFinite(employees) && employees > 0 ? employees : null };
  });
  return { profile: rows.length ? buyerProfile(rows, dealIds.length) : null, coverage: r.coverage() };
}
