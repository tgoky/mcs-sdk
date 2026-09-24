// src/lib/whop-agent/scope-map.ts
//
// Section 6.6 / 8.1's scope-requirement map, as an exhaustive TypeScript
// Record instead of a lookup table a new endpoint can silently miss. Adding
// a WhopEndpoint value without adding it here is a compile error (TS2345 on
// the Record literal below), which is the actual mechanism behind the
// spec's "adding a new list endpoint without an entry is a build-time
// failure, not a runtime one" (Section 8.1, implementation step 1).
//
// Only endpoints an actual, built skill calls are listed — this grows
// alongside the skills in whop-agent-skill-registry.ts, not pre-populated
// speculatively for playbooks that don't have real code yet.

/** Which query parameter a call must carry, and how to read the account id
 * back out of a response record for the post-validation guardrail
 * (Section 8.1, implementation step 3). `"none"` covers endpoints Whop
 * itself scopes some other way (a resource id in the path) — post-
 * validation is skipped for those, since there is no account/company field
 * on the response to check. */
export type WhopScopeParam = "account_id" | "company_id" | "none";

export interface WhopEndpointScope {
  param: WhopScopeParam;
  /** Dot-path(s) into a single response record where an account/company id
   * might appear — checked in order, first present value wins. Empty for
   * `param: "none"`. */
  responseIdPaths?: string[];
}

// The exact endpoint set this file's own header describes, exhaustively
// keyed. Every WhopEndpoint used by lib/whop-agent/client.ts's typed helper
// methods must appear here or the file fails to compile.
export type WhopEndpoint =
  | "accounts.get"
  | "products.list"
  | "products.create"
  | "plans.list"
  | "plans.create"
  | "plans.update"
  | "promo_codes.create"
  | "promo_codes.delete"
  | "promo_codes.deactivate"
  | "memberships.list"
  | "memberships_v2.list"
  | "webhooks.list"
  | "webhooks.get"
  | "webhooks.create"
  | "webhooks.update"
  | "webhooks.delete"
  | "webhooks.send_test_event"
  | "webhooks.deliveries"
  | "disputes.get"
  | "disputes.evidence_submit"
  | "dispute_alerts.list"
  | "disputes.summary"
  | "refunds.list"
  | "course_students.list"
  | "course_lesson_interactions.list"
  | "social_accounts.list"
  | "media.generate"
  | "media.get"
  | "ads.create"
  | "ads.update"
  | "stats.list"
  | "stats.retrieve"
  | "affiliates.list"
  | "identity_profiles.list"
  | "payout_methods.list"
  | "chat_channels.list"
  | "dm_channels.list"
  | "support_channels.list"
  | "app.users";

export const WHOP_SCOPE_MAP: Record<WhopEndpoint, WhopEndpointScope> = {
  // Section 2.4's hard-stop probe — a single-resource GET, not a list, so
  // there's nothing to scope-check the response against.
  "accounts.get": { param: "none" },

  // Section 6.6: "Endpoints requiring account_id: plans, checkout_configurations,
  // webhooks, verifications." products isn't in that table, but Section
  // 8.1's own live probe is explicit that GET /api/v1/products fails open
  // without account_id (returns other businesses' products with HTTP 200)
  // — it's exactly the endpoint the guardrail's rationale is built around.
  "products.list": { param: "account_id", responseIdPaths: ["account.id", "account_id"] },
  "products.create": { param: "account_id" },
  "plans.list": { param: "account_id", responseIdPaths: ["account.id", "account_id"] },
  "plans.create": { param: "none" }, // scoped implicitly by product_id in the body, not a query param
  "plans.update": { param: "none" }, // PATCH /v1/plans/{id} — scoped by resource id in the path
  "promo_codes.create": { param: "none" }, // scoped implicitly by plan_id in the body
  "promo_codes.delete": { param: "none" },
  "promo_codes.deactivate": { param: "none" }, // PATCH /v1/promo_codes/{id} fallback when delete is rejected
  "webhooks.list": { param: "account_id", responseIdPaths: ["account.id", "account_id"] },

  // v1 memberships: no account_id/company_id table entry in Section 6.6,
  // and Section 2.4's probe calls it unscoped (`GET /v1/memberships?limit=1`).
  // Treated as `none` here deliberately, not guessed into `account_id` —
  // Section 6.6's whole point is that the required parameter differs per
  // endpoint with no discernible rule, so a parameter this codebase hasn't
  // independently confirmed Whop rejects/requires must not be asserted.
  "memberships.list": { param: "none" },
  // v2 memberships (Playbook 5.14's attribution source) — page-number
  // pagination, no account_id/company_id requirement observed either; see
  // Section 6.7. Scoped to the connected account implicitly by which key is
  // used, per the spec's own v2-surface framing.
  "memberships_v2.list": { param: "none" },

  "webhooks.create": { param: "account_id" },
  "webhooks.get": { param: "none" }, // GET /v1/webhooks/{id} — scoped by resource id in the path
  "webhooks.update": { param: "none" }, // PATCH /v1/webhooks/{id} — scoped by resource id in the path
  "webhooks.delete": { param: "none" },
  "webhooks.send_test_event": { param: "none" },
  "webhooks.deliveries": { param: "none" },

  "disputes.get": { param: "none" }, // scoped by resource id in the path
  "disputes.evidence_submit": { param: "none" }, // elevated-scope call, scoped by dispute id in the path
  "dispute_alerts.list": { param: "none" },
  // GET /disputes/summary and GET /refunds (@whop/sdk): account_id scoped.
  // Refund records carry no account field to post-check.
  "disputes.summary": { param: "account_id" },
  "refunds.list": { param: "account_id" },
  "course_students.list": { param: "none" }, // scoped by course_id query param per Section 5.10, not account/company
  "course_lesson_interactions.list": { param: "none" }, // scoped by user_id/lesson_id/course_id, not account/company

  "social_accounts.list": { param: "none" },
  "media.generate": { param: "none" },
  "media.get": { param: "none" }, // scoped by media id in the path
  "ads.create": { param: "none" }, // scoped by product/plan ids in the body per Section 5.11
  "ads.update": { param: "none" }, // scoped by ad id in the path — the flip-to-active PATCH

  // GET /stats, the metric catalog: not per account.
  "stats.list": { param: "none" },
  // GET /stats/{metric}: scoped by account_id (@whop/sdk RetrieveStatsRequest).
  "stats.retrieve": { param: "account_id" },

  "affiliates.list": { param: "none" },
  // Section 5.9: both confirmed 200 on a standard key, neither scoped by
  // account_id/company_id in a way Section 6.6's table names explicitly —
  // payout_methods takes company_id per Section 5.9's own call example,
  // identity_profiles takes none observed.
  "identity_profiles.list": { param: "none" },
  "payout_methods.list": { param: "company_id" },

  // Section 6.6: "Endpoints requiring company_id: experiences, chat_channels,
  // forums, entries, leads, setup_intents, payout_methods,
  // company_token_transactions, fee_markups, and refunds."
  "chat_channels.list": { param: "company_id" },
  "dm_channels.list": { param: "none" }, // user-context, not account-scoped — probed to name the missing dms:read scope
  "support_channels.list": { param: "none" },

  // Section 2.1: identifies credential type, not account-scoped.
  "app.users": { param: "none" },
};
