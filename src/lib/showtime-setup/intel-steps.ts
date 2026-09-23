// src/lib/showtime-setup/intel-steps.ts
//
// What Activate says about each tool's deep pull: the numbers it read, in
// a few short chips, plus what the connection wouldn't let us see.

import type { AccountIntel } from "@/lib/account-intel";
import type { ActivationStep } from "./types";

export function formatMoney(amount: number, currency: string | null | undefined): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString("en-US")}${currency ? ` ${currency}` : ""}`;
  }
}

const plural = (n: number, noun: string) => `${n.toLocaleString("en-US")} ${noun}${n === 1 ? "" : "s"}`;

export function intelSteps(intel: AccountIntel, toolLabel: string): ActivationStep[] {
  const steps: ActivationStep[] = [];
  const add = (key: string, label: string) => steps.push({ id: `account-intel-${intel.provider}-${key}`, label, status: "done" });

  const b = intel.booking;
  if (b && b.history.total > 0) {
    add("calls", `${toolLabel}: ${plural(b.history.total, "booking")} in ${b.history.windowDays} days`);
    if (b.history.noShowRate !== null) add("no-shows", `${b.history.noShowRate}% no-shows`);
    if (b.history.cancelRate !== null && b.history.canceled > 0) add("cancels", `${b.history.cancelRate}% canceled`);
  } else if (b && b.eventTypes.length) {
    add("types", `${toolLabel}: ${plural(b.eventTypes.length, "event type")}`);
  }
  const answers = b?.answers.reduce((n, q) => n + q.responses, 0) ?? 0;
  if (answers > 0) add("answers", `${plural(answers, "prospect answer")} read`);

  if (intel.deals && intel.deals.total > 0) {
    add("deals", `${toolLabel}: ${plural(intel.deals.total, "deal")}${intel.deals.winRate !== null ? `, ${intel.deals.winRate}% won` : ""}`);
    if (intel.deals.averageWon) add("deal-size", `Average deal ${formatMoney(intel.deals.averageWon, intel.deals.currency)}`);
  }
  if (intel.meetings?.noShowRate != null) add("meetings", `${intel.meetings.noShowRate}% no-shows logged in ${toolLabel}`);
  if (intel.email && intel.email.campaigns > 0) {
    add("email", `${plural(intel.email.campaigns, "email")} read${intel.email.averageOpenRate !== null ? `, ${intel.email.averageOpenRate}% opened` : ""}`);
  }
  if (intel.automations?.length) add("automations", `${plural(intel.automations.length, "automation")} found`);
  if (intel.contacts?.total) add("contacts", `${plural(intel.contacts.total, "contact")}`);
  if (intel.team && intel.team.length > 1) add("team", `${plural(intel.team.length, "teammate")}`);

  if (steps.length === 0) steps.push({ id: `account-intel-${intel.provider}`, label: `${toolLabel}: nothing to read yet`, status: "skipped" });
  if (intel.coverage.blocked.length) {
    steps.push({
      id: `account-intel-${intel.provider}-blocked`,
      label: `${toolLabel} didn't share ${intel.coverage.blocked.slice(0, 3).join(", ")}`,
      status: "skipped",
      detail: "The connection doesn't have permission for these. Reconnect with more access to include them.",
    });
  }
  return steps;
}
