"use client";

// src/components/product-setup/account-read.tsx
//
// "What your tools told us": the review's read of the connected accounts.
// A single row of the numbers that matter, the sales-call event (editable),
// the business in a few sentences, and the prospects' own words. Nothing
// here is typed by anyone; every number is counted from the account.

import { AlertTriangle, Quote } from "lucide-react";
import type { AccountRead, TrustTier } from "@/lib/showtime-setup/types";
import { formatMoney } from "@/lib/showtime-setup/intel-steps";
import { ChoiceList, FactToken } from "./fact-token";
import { cn } from "@/lib/utils";

type TokenProps = (key: string) => { open: boolean; onOpenChange: (open: boolean) => void };

export function hasAccountRead(read: AccountRead): boolean {
  return Boolean(read.booking || read.deals || read.email || read.brief || read.eventTypes.length || read.prospectWords.length);
}

function Stat({ value, label, from }: { value: string; label: string; from: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">{value}</p>
      <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{label}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{from}</p>
    </div>
  );
}

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

export function AccountReadSection({
  read,
  salesCallId,
  salesCallTier,
  onPickSalesCall,
  tokenProps,
}: {
  read: AccountRead;
  salesCallId: string | null;
  salesCallTier: TrustTier;
  onPickSalesCall: (id: string) => void;
  tokenProps: TokenProps;
}) {
  const b = read.booking;
  const d = read.deals;
  const e = read.email;
  const stats: { value: string; label: string; from: string }[] = [];
  if (b) {
    stats.push({ value: b.total.toLocaleString("en-US"), label: `bookings in ${b.windowDays} days`, from: b.tool });
    if (b.noShowRate !== null) stats.push({ value: pct(b.noShowRate), label: "no-shows", from: `${b.attendanceKnown} calls checked` });
    if (b.cancelRate !== null) stats.push({ value: pct(b.cancelRate), label: "canceled", from: b.tool });
  }
  if (d) {
    if (d.winRate !== null) stats.push({ value: pct(d.winRate), label: "of closed deals won", from: `${d.total} deals in ${d.tool}` });
    if (d.averageWon) stats.push({ value: formatMoney(d.averageWon, d.currency), label: "average deal", from: d.tool });
  }
  if (e?.averageOpenRate != null) stats.push({ value: pct(e.averageOpenRate), label: "emails opened", from: `${e.campaigns} sends in ${e.tool}` });

  const salesCall = read.eventTypes.find((t) => t.id === salesCallId) ?? null;
  const details: string[] = [];
  if (b?.busiestDays.length) details.push(`Most calls land on ${b.busiestDays.join(" and ")}${b.busiestHours.length ? ` around ${b.busiestHours.join(" and ")}` : ""}.`);
  if (b?.medianLeadTimeDays != null) details.push(`People book about ${b.medianLeadTimeDays} day${b.medianLeadTimeDays === 1 ? "" : "s"} ahead.`);
  if (d?.medianCycleDays != null) details.push(`Deals close in about ${Math.round(d.medianCycleDays)} days.`);
  if (d && d.openValue > 0) details.push(`${formatMoney(d.openValue, d.currency)} is open in the pipeline.`);

  const brief = read.brief;
  const words = read.prospectWords.flatMap((q) => q.answers.slice(0, 2).map((a) => ({ q: q.question, a }))).slice(0, 4);

  return (
    <div className="space-y-6">
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4 sm:grid-cols-3">
          {stats.slice(0, 6).map((s) => (
            <Stat key={s.label} {...s} />
          ))}
        </div>
      )}

      {(read.eventTypes.length > 0 || details.length > 0) && (
        <p className="max-w-[62ch] text-[15px] leading-[2] text-[var(--text-secondary)]">
          {read.eventTypes.length > 0 && (
            <>
              Sales calls book through{" "}
              <FactToken
                {...tokenProps("salesCall")}
                display={salesCall?.name ?? null}
                placeholder="which event?"
                tier={salesCallTier}
                title="Which event is the sales call?"
                source={read.salesCall?.evidence ?? "Pick the event prospects book before they buy."}
                width={340}
              >
                <ChoiceList
                  options={read.eventTypes.map((t) => ({ value: t.id, label: t.name, hint: t.durationMin ? `${t.durationMin} min` : undefined }))}
                  value={salesCallId}
                  onPick={(id) => {
                    onPickSalesCall(id);
                    tokenProps("salesCall").onOpenChange(false);
                  }}
                />
              </FactToken>
              .{" "}
            </>
          )}
          {details.join(" ")}
        </p>
      )}

      {brief && (
        <div className="space-y-4">
          <p className="max-w-[66ch] text-[17px] leading-[1.75] text-[var(--text-primary)]">{brief.summary}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {read.briefTier === "done"
              ? "Read from your tools and checked against them."
              : read.briefTier === "likely"
                ? "Read from your tools. Mostly holds up against the numbers."
                : "Read from your tools. We're not sure about all of it, so nothing is built from it yet."}
          </p>
          {(brief.prospectGoals.length > 0 || brief.prospectConcerns.length > 0 || brief.prospectPains.length > 0) && (
            <div className="grid gap-6 sm:grid-cols-2">
              <WordList title="What prospects want" items={brief.prospectGoals.length ? brief.prospectGoals : brief.prospectPains} />
              <WordList title="What holds them back" items={brief.prospectConcerns} />
            </div>
          )}
          {brief.watchOuts.length > 0 && (
            <ul className="space-y-1.5">
              {brief.watchOuts.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning,var(--text-muted))]" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {words.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">In their own words</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {words.map((w, i) => (
              <li key={i} className="flex gap-2.5">
                <Quote className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-[var(--text-primary)]">{w.a}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{w.q}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FooterFacts read={read} />
    </div>
  );
}

function WordList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      <ul className="space-y-1">
        {items.map((t) => (
          <li key={t} className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FooterFacts({ read }: { read: AccountRead }) {
  const bits: string[] = [];
  if (read.sender) bits.push(`Emails go out as ${[read.sender.fromName, read.sender.fromEmail && `<${read.sender.fromEmail}>`].filter(Boolean).join(" ")}`);
  if (read.automations.length) bits.push(`${read.automations.length} automation${read.automations.length === 1 ? "" : "s"} already running`);
  if (read.team.length > 1) bits.push(`${read.team.length} people on the team`);
  if (read.leadSources.length) bits.push(`Leads mostly from ${read.leadSources.slice(0, 2).map((s) => s.source).join(" and ")}`);
  if (bits.length === 0 && read.blocked.length === 0) return null;
  return (
    <div className="space-y-1 border-t pt-3 text-[13px] text-[var(--text-muted)]">
      {bits.length > 0 && <p>{bits.join(" · ")}</p>}
      {read.blocked.map((x) => (
        <p key={x.tool} className={cn("text-[var(--text-muted)]")}>
          {x.tool} didn&apos;t share {x.parts.join(", ")}. Reconnect it with more access to include them.
        </p>
      ))}
    </div>
  );
}
