import { NextResponse } from "next/server";
import { upsertClientFact } from "@/lib/client-facts";
import { resolveCredential } from "@/lib/credentials";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { connectWhopAccount } from "@/features/whop-agent/server/connect-service";
import { auditWebhookFleet } from "@/features/whop-agent/server/webhook-audit-service";
import { readWhopAccount } from "@/lib/whop-setup/reader";
import { snapshotOf } from "@/lib/whop-setup/analyze";
import { loadWhopConnection, WHOP_READ_FACT } from "@/lib/whop-setup/state";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import { authorizeProductSetup } from "../../showtime/access";

export const runtime = "nodejs";
export const revalidate = 0;
export const maxDuration = 300;

const plural = (n: number, noun: string, more = false) => `${n}${more ? "+" : ""} ${noun}${n === 1 && !more ? "" : "s"}`;
const money = (v: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(v);

/**
 * Whop Agent's "Set it up": connects the key when one is pasted (a
 * connected client isn't asked again), then reads the business in depth
 * and checks the webhooks already on the account. Streams one NDJSON line
 * per finished step. Reads only; nothing is written to Whop here.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeProductSetup(id, "whop-agent", { requireInstalled: true });
  if (!access.ok) return access.response;
  const body = (await req.json().catch(() => ({}))) as { apiKey?: unknown };
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey && !(await loadWhopConnection(id))) return NextResponse.json({ error: "Paste the Whop API key first." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      const step = (s: ActivationStep) => send({ type: "step", step: s });
      try {
        // ── 1. The key ──
        if (apiKey) {
          const result = await connectWhopAccount(id, apiKey);
          if (!result.ok) {
            step({ id: "key", label: "Whop didn't accept that key", status: "failed", detail: result.error });
            send({ type: "error", error: result.error ?? "Whop didn't accept that key." });
            return;
          }
          await setSkillEnabledForEngagement(id, "whop-connect", true);
          const open = Object.values(result.probe?.results ?? {}).filter((r) => r.ok).length;
          step({ id: "key", label: `Connected ${result.probe?.whopAccountId ?? "your Whop account"}`, status: "done", detail: `${open} of ${Object.keys(result.probe?.results ?? {}).length} areas open to this key` });
          if (!result.pinnedVersionDate) step({ id: "key-pin", label: "Whop's API version couldn't be checked", status: "failed", detail: "Webhooks can't be created until it is. Try connecting again later." });
        } else {
          step({ id: "key", label: "Already connected", status: "reused" });
        }

        const connection = await loadWhopConnection(id);
        if (!connection?.whopAccountId) throw new Error("No Whop account on this connection.");

        // ── 2. The business ──
        const read = await readWhopAccount(await resolveCredential(id, "whop_bot_api_key"), connection.whopAccountId);
        await upsertClientFact(id, WHOP_READ_FACT, read, { source: "account", sourceDetail: "whop_bot_api_key", evidence: `Read from Whop account ${read.accountId}.` });
        const s = snapshotOf(read);

        const plansLabel = read.plans.length ? `${plural(read.products.length, "product")}, ${plural(read.plans.length, "plan")}` : "No plans found";
        step({ id: "read-catalog", label: plansLabel, status: read.plans.length ? "done" : "skipped" });
        if (s.mrr) step({ id: "read-mrr", label: `${money(s.mrr.value, s.mrr.currency)} a month in recurring revenue${s.mrr.source === "plans" ? " (from plan prices)" : ""}`, status: "done" });
        if (s.members != null) step({ id: "read-members", label: `${plural(s.members, "active member")}${read.newMembers30d ? `, ${read.newMembers30d.count}${read.newMembers30d.more ? "+" : ""} new this month` : ""}`, status: "done" });
        if (read.canceling) step({ id: "read-canceling", label: `${plural(read.canceling.count, "member", read.canceling.more)} set to cancel`, status: "done" });
        if (read.refunds90d || read.disputes90d) {
          const parts = [read.refunds90d ? plural(read.refunds90d.count, "refund", read.refunds90d.more) : null, read.disputes90d ? plural(read.disputes90d.total, "dispute") : null].filter(Boolean);
          step({ id: "read-risk", label: `${parts.join(" and ")} in 90 days`, status: "done" });
        }
        if (read.promoCodes?.length) step({ id: "read-promos", label: plural(read.promoCodes.length, "active promo code"), status: "done" });
        if (read.affiliates?.length) step({ id: "read-affiliates", label: plural(read.affiliates.length, "affiliate"), status: "done" });
        if (read.reviews.length) step({ id: "read-reviews", label: plural(read.reviews.length, "store review"), status: "done" });
        if (read.coverage.blocked.length) step({ id: "read-blocked", label: `The key can't read ${read.coverage.blocked.join(", ")}`, status: "skipped" });

        // ── 3. Webhooks already on the account ──
        try {
          const audit = await auditWebhookFleet(id);
          const issues = audit.duplicateGroups.length + audit.unpinned.length + audit.alreadyDisabled.length;
          step({ id: "hooks", label: audit.total ? `${plural(audit.total, "webhook")} on the account${issues ? `, ${plural(issues, "problem")}` : ""}` : "No webhooks on the account yet", status: issues ? "failed" : "done" });
        } catch (err) {
          console.warn(`[setup/whop/activate] webhook audit failed for ${id}:`, err instanceof Error ? err.message : err);
          step({ id: "hooks", label: "Couldn't check the webhooks", status: "skipped" });
        }

        send({ type: "done" });
      } catch (err) {
        console.error(`[setup/whop/activate] ${id}:`, err);
        send({ type: "error", error: "Something went wrong while reading Whop. What was found so far is kept." });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
