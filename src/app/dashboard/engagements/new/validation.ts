import { BOOKING_PLATFORM_LABELS, EMAIL_PLATFORM_LABELS, HOSTING_PLATFORM_LABELS } from "@/lib/copy";
import type { FormData, Step, ValidationError } from "./types";

// ── PRE-FLIGHT AUDIT ENGINE: Scans all 5 steps and flags missing inputs ──
export function getValidationErrors(form: FormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Step 1: Offer
  if (!form.buyerName.trim()) {
    errors.push({ step: "offer", stepLabel: "Your Offer", issue: "Client / Company Name is required" });
  }
  if (!form.offerName.trim()) {
    errors.push({ step: "offer", stepLabel: "Your Offer", issue: "Offer Name ('What are you selling?') is required" });
  }
  if (!form.offerIcp.trim()) {
    errors.push({ step: "offer", stepLabel: "Your Offer", issue: "Ideal Customer Profile (ICP) is required" });
  }

  // Step 2: Stack
  if (!form.bookingPlatform) {
    errors.push({ step: "stack", stepLabel: "Connect Your Tools", issue: "Booking Calendar selection is required" });
  }
  if ((form.bookingPlatform === "calendly" || form.bookingPlatform === "cal_com") && !form.bookingStandingLink.trim()) {
    errors.push({ step: "stack", stepLabel: "Connect Your Tools", issue: "Standing booking page link is required" });
  }
  // if (form.bookingPlatform === "ghl_calendar" && !form.bookingLocationId.trim()) {
  //   errors.push({ step: "stack", stepLabel: "Connect Your Tools", issue: "GoHighLevel Location ID is required for GHL Calendar" });
  // }
  if (!form.emailPlatform) {
    errors.push({ step: "stack", stepLabel: "Connect Your Tools", issue: "Email Platform selection is required" });
  }
  if (!form.hostingPlatform) {
    errors.push({ step: "stack", stepLabel: "Connect Your Tools", issue: "Hosting platform selection is required" });
  }

  // Step 3: Account Keys
  if (!form.bookingApiKey.trim()) {
    errors.push({ step: "credentials", stepLabel: "Account Keys", issue: `Booking Platform (${BOOKING_PLATFORM_LABELS[form.bookingPlatform] ?? form.bookingPlatform}) API Key is missing` });
  }
  if (form.emailPlatform === "smtp") {
    if (!form.smtpHost.trim() || !form.smtpPort.trim() || !form.smtpUsername.trim() || !form.smtpPassword.trim() || !form.smtpFromAddress.trim()) {
      errors.push({ step: "credentials", stepLabel: "Account Keys", issue: "Complete SMTP server credentials are required (host, port, username, password, from address)" });
    }
  } else if (!form.emailApiKey.trim()) {
    errors.push({ step: "credentials", stepLabel: "Account Keys", issue: `Email Platform (${EMAIL_PLATFORM_LABELS[form.emailPlatform] ?? form.emailPlatform}) API Key is missing` });
  }

  if (form.emailPlatform === "klaviyo") {
    if (!form.emailTargetListId) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: "Klaviyo Target List (Pile-On) must be selected" });
    if (!form.emailRecoveryListId) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: "Klaviyo Recovery List (Win-Back) must be selected" });
  }
  if (form.emailPlatform === "activecampaign") {
    if (!form.emailActiveCampaignBaseUrl.trim()) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: "ActiveCampaign Base API URL is required" });
    if (!form.emailTargetListId) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: "ActiveCampaign Target List must be selected" });
    if (!form.emailRecoveryListId) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: "ActiveCampaign Recovery List must be selected" });
  }
  if (form.emailPlatform === "mailchimp" || form.emailPlatform === "convertkit") {
    if (!form.emailTargetListId) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: `${EMAIL_PLATFORM_LABELS[form.emailPlatform]} Target List / Form ID is required` });
    if (!form.emailRecoveryListId) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: `${EMAIL_PLATFORM_LABELS[form.emailPlatform]} Recovery List / Tag ID is required` });
  }
  if (form.emailPlatform === "ghl") {
    if (!form.emailGhlLocationId) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: "GHL Location selection is required" });
    if (!form.emailGhlTargetWorkflowId) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: "GHL Target Workflow (Pile-On) must be selected" });
    if (!form.emailGhlRecoveryWorkflowId) errors.push({ step: "credentials", stepLabel: "Account Keys", issue: "GHL Recovery Workflow (Win-Back) must be selected" });
  }
  // if (form.hostingPlatform !== "ghl" && form.hostingPlatform !== "plain_html" && !form.hostingApiKey.trim()) {
  //   errors.push({ step: "credentials", stepLabel: "Account Keys", issue: `Hosting Platform (${HOSTING_PLATFORM_LABELS[form.hostingPlatform] ?? form.hostingPlatform}) API Token is missing` });
  // }

  // Step 4: Voice
  const wordCount = form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 500) {
    errors.push({ step: "voice", stepLabel: "Your Brand Voice", issue: `Brand Voice sample needs at least 500 words (currently ${wordCount} words)` });
  }
  const questionsCount = form.topCallQuestions.split("\n").map((q) => q.trim()).filter(Boolean).length;
  if (questionsCount < 3) {
    errors.push({ step: "voice", stepLabel: "Your Brand Voice", issue: `Top Call Questions requires at least 3 items (currently ${questionsCount} provided)` });
  }
  const objectionsCount = form.topObjections.split("\n").map((o) => o.trim()).filter(Boolean).length;
  if (objectionsCount < 2) {
    errors.push({ step: "voice", stepLabel: "Your Brand Voice", issue: `Top Objections requires at least 2 items (currently ${objectionsCount} provided)` });
  }

  return errors;
}

export function isCurrentStepValid(form: FormData, step: Step): boolean {
  const allErrors = getValidationErrors(form);
  return !allErrors.some((e) => e.step === step);
}
