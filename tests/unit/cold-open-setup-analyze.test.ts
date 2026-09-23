import { describe, it, expect } from "vitest";
import {
  buyerProfile,
  emailText,
  importTouchset,
  platformSubject,
  voiceFromSteps,
  mailboxDomains,
  overallReplyRate,
  prettyIndustry,
  rankCampaigns,
  rankSubjects,
  sendCapacity,
  suggestDailyVolume,
  touchsetsFromSteps,
  type Mailbox,
  type SenderCampaign,
  type SenderStep,
} from "@/lib/cold-open-setup/analyze";

const c = (id: string, sent: number, replies: number): SenderCampaign => ({ id, name: `Campaign ${id}`, status: null, sent, opens: null, replies, bounces: null });
const mb = (email: string, dailyLimit: number | null, extra: Partial<Mailbox> = {}): Mailbox => ({ email, fromName: null, dailyLimit, warmupStatus: null, health: null, broken: false, ...extra });

describe("campaign results", () => {
  it("ranks only campaigns with enough sends, best reply rate first", () => {
    const ranked = rankCampaigns([c("a", 1000, 20), c("b", 400, 20), c("c", 30, 10)]);
    expect(ranked.map((x) => [x.id, x.replyRate])).toEqual([
      ["b", 5],
      ["a", 2],
    ]);
    expect(overallReplyRate([c("a", 1000, 20), c("b", 400, 20)])).toBe(2.9);
  });
});

describe("mailboxes", () => {
  it("counts capacity only from mailboxes that work and are healthy", () => {
    const boxes = [mb("a@acme.com", 50, { health: 98 }), mb("b@acme.com", 40), mb("c@getacme.com", 50, { health: 40 }), mb("d@acme.com", 50, { broken: true })];
    expect(sendCapacity(boxes)).toBe(90);
    expect(mailboxDomains(boxes)).toEqual(["acme.com", "getacme.com"]);
  });
  it("suggests new leads a day that leave room for follow-ups", () => {
    expect(suggestDailyVolume(90)).toBe(30);
    expect(suggestDailyVolume(3000)).toBe(500);
    expect(suggestDailyVolume(0)).toBe(0);
    expect(suggestDailyVolume(null)).toBeNull();
  });
});

describe("the client's own copy", () => {
  const campaigns = [c("a", 1000, 20), c("b", 400, 20)];
  const steps: SenderStep[] = [
    { campaignId: "a", campaignName: "Agencies", step: 1, subject: "quick question", body: "<p>Hi {{firstName}},</p><p>Saw your site&nbsp;&amp; had an idea.</p>" },
    { campaignId: "a", campaignName: "Agencies", step: 2, subject: "", body: "<div>Bumping this.</div>" },
    { campaignId: "b", campaignName: "SaaS", step: 1, subject: "idea for {{company}}", body: "Hi there" },
    { campaignId: "b", campaignName: "SaaS", step: 2, subject: "", body: "Following up" },
    { campaignId: "b", campaignName: "SaaS", step: 3, subject: "", body: "Last note" },
  ];
  it("turns HTML bodies into plain text", () => {
    expect(emailText("<p>Hi {{firstName}},</p><p>Saw your site&nbsp;&amp; had an idea.</p>")).toBe("Hi {{firstName}},\nSaw your site & had an idea.");
  });
  it("ranks first-email subjects by how their campaign did", () => {
    expect(rankSubjects(steps, campaigns).map((s) => [s.subject, s.replyRate])).toEqual([
      ["idea for {{company}}", 5],
      ["quick question", 2],
    ]);
  });
  it("makes touchsets from real sequences, repeating a missing third email", () => {
    const sets = touchsetsFromSteps(steps, campaigns);
    expect(sets[0]).toEqual({ subject: "idea for {{company}}", body1: "Hi there", body2: "Following up", body3: "Last note", campaign: "SaaS" });
    expect(sets[1]).toMatchObject({ subject: "quick question", body2: "Bumping this.", body3: "Bumping this." });
  });
});

describe("buyerProfile", () => {
  it("finds the industries and the headcount range most buyers fall in", () => {
    const p = buyerProfile(
      [
        { name: "A", industry: "MARKETING_AND_ADVERTISING", employees: 12 },
        { name: "B", industry: "MARKETING_AND_ADVERTISING", employees: 30 },
        { name: "C", industry: "COMPUTER_SOFTWARE", employees: 45 },
        { name: "D", industry: "MARKETING_AND_ADVERTISING", employees: 80 },
        { name: "E", industry: null, employees: 25 },
        { name: "F", industry: "COMPUTER_SOFTWARE", employees: 5000 },
      ],
      9
    );
    expect(p.industries[0]).toEqual({ industry: "Marketing And Advertising", count: 3 });
    expect(p.sweetSpot).toEqual({ min: 11, max: 200, share: 83 });
    expect(p.wonDeals).toBe(9);
    expect(prettyIndustry("Fintech")).toBe("Fintech");
  });
});


describe("importing past emails safely", () => {
  it("converts company tokens in subjects and drops ones with fields we can't fill", () => {
    expect(platformSubject("idea for {{companyName}}")).toBe("idea for {company_name}");
    expect(platformSubject("{{firstName}}, quick one")).toBeNull();
    expect(platformSubject("quick question")).toBe("quick question");
  });
  it("strips the first email's greeting and sign-off (Daily Send adds its own)", () => {
    expect(
      importTouchset({ subject: "quick question", body1: "Hey {{firstName}},\nSaw your hiring post.\nWorth a chat?\nCheers,\nJane", body2: "Bumping this.", body3: "Last note." })
    ).toEqual({ subject: "quick question", body1: "Saw your hiring post.\nWorth a chat?", body2: "Bumping this.", body3: "Last note." });
  });
  it("never keeps an email that would send a raw field", () => {
    expect(importTouchset({ subject: "hi", body1: "Hi,\nLoved what {{companyName}} is doing.", body2: "x", body3: "y" })).toBeNull();
  });
  it("learns the greeting and sign-off the client really uses", () => {
    const steps = ["Hey {{firstName}},\nOne.\nCheers,\nJane", "hey there,\nTwo.\nCheers", "Hi Sam,\nThree.\nBest"].map((body, i) => ({ campaignId: String(i), campaignName: "x", step: 1, subject: "s", body }));
    expect(voiceFromSteps(steps)).toEqual({ greeting: "Hey", signOff: "Cheers" });
  });
});
