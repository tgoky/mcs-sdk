import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { assembleCopyForLead } from "@/features/cold-open/server/copy-engine";
import type { LeadRow } from "@/features/cold-open/server/fetchers/base";

const lead: LeadRow = { domain: "globex.com", companyName: "Globex", firstName: "Hank", lastName: "", email: "hank@globex.com", title: "", city: "", state: "", country: "", linkedinUrl: "", phone: "", icp: "agencies", source: "csv", extra: {} };

describe("upload copy", () => {
  it("fills {company_name} in a touchset's own subject when there's no subject pool", async () => {
    const copy = await assembleCopyForLead(
      {
        bodyVariantPools: { default: [{ subject: "idea for {company_name}", body1: "Saw your site.", body2: "Any thoughts?", body3: "Last one." }] },
        subjectVariants: [],
        voiceProfile: { greeting: "Hi", signOff: "Best", tone: "Plain" },
        dailySendSettings: { volume: 10, localHour: 9, copyMode: "upload", liveSendEnabled: false },
        productIdentity: null,
      },
      lead
    );
    expect(copy?.subject).toBe("idea for Globex");
    expect(copy?.body1).toBe("Hi Hank,\n\nSaw your site.\n\nBest");
  });
});
