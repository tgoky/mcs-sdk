import { describe, it, expect } from "vitest";
import { looksLikeBounceNotification, extractBouncedRecipient } from "@/features/win-back/server/smtp-bounce-classifier";

describe("looksLikeBounceNotification", () => {
  it("matches a real Postfix-style mailer-daemon DSN by sender alone", () => {
    expect(looksLikeBounceNotification("mailer-daemon@mail.example.com", "Undelivered Mail Returned to Sender", "")).toBe(true);
  });

  it("matches a Gmail-style delivery-failure subject even with an unrecognized sender", () => {
    expect(looksLikeBounceNotification("random@sendinghost.com", "Delivery Status Notification (Failure)", "")).toBe(true);
  });

  it("matches on body content when subject is generic", () => {
    expect(
      looksLikeBounceNotification("noreply@sendinghost.com", "Re: your message", "Your message could not be delivered to the following recipients.")
    ).toBe(true);
  });

  it("matches a 550 SMTP rejection code in the body", () => {
    expect(looksLikeBounceNotification("bounce@host.com", "Failure notice", "550 5.1.1 The email account does not exist")).toBe(true);
  });

  it("does NOT match a genuine reply", () => {
    expect(looksLikeBounceNotification("prospect@company.com", "Re: quick question", "Sure, let's talk Tuesday at 2pm.")).toBe(false);
  });

  it("does NOT match an out-of-office autoresponder (a real auto-reply, not a bounce)", () => {
    expect(looksLikeBounceNotification("prospect@company.com", "Automatic reply: Out of Office", "I am currently out of the office until Monday.")).toBe(false);
  });

  it("does NOT match an empty/unrelated message", () => {
    expect(looksLikeBounceNotification("someone@company.com", "", "")).toBe(false);
  });
});

describe("extractBouncedRecipient", () => {
  it("extracts an email following 'to:' phrasing", () => {
    expect(extractBouncedRecipient("This message could not be delivered to: jane@prospect.com")).toBe("jane@prospect.com");
  });

  it("extracts an email preceding 'failed' phrasing", () => {
    expect(extractBouncedRecipient("Delivery to jane@prospect.com failed permanently.")).toBe("jane@prospect.com");
  });

  it("lowercases the extracted address", () => {
    expect(extractBouncedRecipient("could not be delivered to: Jane@Prospect.COM")).toBe("jane@prospect.com");
  });

  it("returns null rather than a wrong guess when no recognizable pattern is present", () => {
    expect(extractBouncedRecipient("Some unrelated bounce text with no clear recipient field.")).toBeNull();
  });
});
