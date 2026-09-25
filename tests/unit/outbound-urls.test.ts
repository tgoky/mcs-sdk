import { describe, it, expect } from "vitest";
import { activeCampaignApiBase, slackWebhookUrl, mailchimpDatacenter, mailchimpApiEndpoint } from "@/lib/outbound-urls";

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

describe("mailchimpDatacenter", () => {
  it("reads the datacenter off a real key", () => {
    expect(mailchimpDatacenter("0123456789abcdef0123456789abcdef-us21")).toBe("us21");
    expect(mailchimpDatacenter(" abc-US6 ")).toBe("us6");
  });

  it("refuses anything that would steer the request to another host", () => {
    for (const key of ["abc-evil.com#", "abc-us21.evil.com", "abc-", "nodash", "abc-us", "abc-us21/x", "-us21", "abc-u1"]) {
      expect(mailchimpDatacenter(key)).toBeNull();
    }
    expect(mailchimpDatacenter(undefined)).toBeNull();
  });
});

describe("mailchimpApiEndpoint", () => {
  it("keeps only https on a <dc>.api.mailchimp.com host", () => {
    expect(mailchimpApiEndpoint("https://us21.api.mailchimp.com")).toBe("https://us21.api.mailchimp.com");
    expect(mailchimpApiEndpoint("https://us21.api.mailchimp.com.evil.com")).toBeNull();
    expect(mailchimpApiEndpoint("http://us21.api.mailchimp.com")).toBeNull();
    expect(mailchimpApiEndpoint("https://user@us21.api.mailchimp.com")).toBeNull();
    expect(mailchimpApiEndpoint(null)).toBeNull();
  });
});
