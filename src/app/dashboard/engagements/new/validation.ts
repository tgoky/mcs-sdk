import { BOOKING_PLATFORM_LABELS, EMAIL_PLATFORM_LABELS } from "@/lib/copy";
import type { FormData, Step, ValidationError } from "./types";

/**
 * Smart helper: Splits text by newlines, commas, semicolons, or numbered lists (e.g. 1., 2.)
 */
function countItems(text: string): number {
  if (!text || !text.trim()) return 0;
  return text
    .split(/[\n,;]|\d+\.\s*/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

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

  // Step 4: Voice
  if (form.voiceSource === "scrape") {
    // Scraping Mode: Website domain required, pasted text optional!
    if (!form.marketingDomain.trim() && !form.publishDomain.trim()) {
      errors.push({ step: "voice", stepLabel: "Your Brand Voice", issue: "Marketing website URL is required when scraping brand voice" });
    }
  } else {
    // Manual Mode: Require at least 50 words
    const wordCount = form.rawVoiceCorpus.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 50) {
      errors.push({ step: "voice", stepLabel: "Your Brand Voice", issue: `Brand Voice sample needs at least 50 words (currently ${wordCount} words)` });
    }
  }

  // Common Call Questions: Require at least 1 item (accepts commas, newlines, semicolons, or numbered lists)
  if (countItems(form.topCallQuestions) < 1) {
    errors.push({ step: "voice", stepLabel: "Your Brand Voice", issue: "At least 1 common call question is required" });
  }

  // Common Objections: Require at least 1 item (accepts commas, newlines, semicolons, or numbered lists)
  if (countItems(form.topObjections) < 1) {
    errors.push({ step: "voice", stepLabel: "Your Brand Voice", issue: "At least 1 common objection is required" });
  }

  return errors;
}

export function isCurrentStepValid(form: FormData, step: Step): boolean {
  const allErrors = getValidationErrors(form);
  return !allErrors.some((e) => e.step === step);
}