import { describe, it, expect } from "vitest";
import { activeCampaignApiBase, slackWebhookUrl } from "@/lib/outbound-urls";

describe("addresses the server calls", () => {
  it("takes only a real ActiveCampaign API address", () => {
    expect(activeCampaignApiBase("https://acme.api-us1.com/api/3/")).toBe("https://acme.api-us1.com/api/3");
    expect(activeCampaignApiBase("https://acme.activehosted.com")).toBe("https://acme.activehosted.com");
    for (const bad of ["http://acme.api-us1.com/api/3", "https://169.254.169.254/latest", "https://localhost/api/3", "https://acme.api-us1.com.evil.example/api/3", "https://evil.example/?x=.api-us1.com", "https://user:pw@acme.api-us1.com", "https://acme.api-us1.com:8443/api/3", "not a url", ""]) {
      expect(activeCampaignApiBase(bad), bad).toBeNull();
    }
  });

  it("takes only a Slack incoming webhook", () => {
    expect(slackWebhookUrl("https://hooks.slack.com/services/T0/B0/xyz")).toBe("https://hooks.slack.com/services/T0/B0/xyz");
    for (const bad of ["http://hooks.slack.com/services/x", "https://hooks.slack.com.evil.example/x", "https://127.0.0.1/x", "https://example.com/hooks.slack.com"]) {
      expect(slackWebhookUrl(bad), bad).toBeNull();
    }
  });
});
