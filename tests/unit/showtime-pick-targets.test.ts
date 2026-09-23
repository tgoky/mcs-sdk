import { describe, it, expect } from "vitest";
import { showtimePickTargets } from "@/lib/showtime-setup/picks";

const slots = (t: ReturnType<typeof showtimePickTargets>) => t.map((x) => `${x.slot}:${x.resource}`);

describe("showtimePickTargets", () => {
  it("asks for Pile-On and Win-Back lists on list-based email tools", () => {
    expect(slots(showtimePickTargets({ emailPlatform: "klaviyo", hostingPlatform: null }))).toEqual([
      "target_list_id:klaviyo-lists",
      "recovery_list_id:klaviyo-lists",
    ]);
    expect(slots(showtimePickTargets({ emailPlatform: "convertkit", hostingPlatform: null }))).toEqual([
      "target_list_id:convertkit-forms",
      "recovery_list_id:convertkit-tags",
    ]);
  });

  it("asks HubSpot for a Win-Back workflow, not lists", () => {
    expect(slots(showtimePickTargets({ emailPlatform: "hubspot", hostingPlatform: null }))).toEqual(["recovery_workflow_id:hubspot-workflows"]);
  });

  it("only asks ActiveCampaign once its account URL is known", () => {
    expect(showtimePickTargets({ emailPlatform: "activecampaign", hostingPlatform: null })).toEqual([]);
    const withUrl = showtimePickTargets({ emailPlatform: "activecampaign", hostingPlatform: null, activecampaignBaseUrl: "https://a.api-us1.com/api/3" });
    expect(withUrl).toHaveLength(2);
    expect(withUrl[0].params).toEqual({ baseUrl: "https://a.api-us1.com/api/3" });
  });

  it("asks which site or project to publish to for hosts with a publish API", () => {
    expect(slots(showtimePickTargets({ emailPlatform: null, hostingPlatform: "webflow" }))).toEqual(["webflow_site_id:webflow-sites"]);
    expect(slots(showtimePickTargets({ emailPlatform: null, hostingPlatform: "nextjs_vercel" }))).toEqual(["vercel_project_name:vercel-projects"]);
    expect(showtimePickTargets({ emailPlatform: "smtp", hostingPlatform: "plain_html" })).toEqual([]);
  });
});
