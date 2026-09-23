// src/lib/whop-agent/errors.ts
//
// The Section 6.5 error taxonomy, as real classes rather than string
// matching scattered across every caller. Every Whop Agent skill catches
// these specific types, never a generic Error, so a scope-permission denial
// and a dead credential can never be confused with each other the way a
// status-code-only taxonomy would confuse them (see WhopScopePermissionError
// below — the single most likely error-handling bug the spec calls out).

/** Base class for every classified Whop API failure. `raw` keeps the exact
 * response body around for the audit log — never discarded, even once
 * it's been classified into a specific subtype. */
export class WhopApiError extends Error {
  readonly status: number;
  readonly raw: unknown;
  constructor(message: string, status: number, raw: unknown) {
    super(message);
    this.name = "WhopApiError";
    this.status = status;
    this.raw = raw;
  }
}

/**
 * Scope-permission error (Section 6.5) — arrives as HTTP 400, not 403, with
 * a message body prefixed "Unauthorized: Actor is missing all required
 * permissions:" followed by the scope name. Recoverable without a full
 * reconnect: report the named scope, don't retry.
 *
 * Deliberately its own class, not folded into a generic "auth error" —
 * a taxonomy that routes on status code alone classifies this as a
 * validation error (it's a 400) and hands the operator the wrong
 * remediation. See the module doc on WhopUnnamedAuthorizationError for the
 * other denial class this must never be confused with.
 */
export class WhopScopePermissionError extends WhopApiError {
  readonly missingScope: string;
  constructor(missingScope: string, status: number, raw: unknown) {
    super(`Missing required Whop permission: ${missingScope}`, status, raw);
    this.name = "WhopScopePermissionError";
    this.missingScope = missingScope;
  }
}

/**
 * Unnamed authorization error (Section 6.5) — a 400 with "You are not
 * authorized - ensure that you have access to this resource", or a bare
 * 403 with no scope name in the body. Observed on payments, invoices,
 * affiliates, payment methods on a standard key. Report honestly that the
 * capability didn't unlock and Whop didn't say why — never fabricate a
 * scope name to fill the gap.
 */
export class WhopUnnamedAuthorizationError extends WhopApiError {
  constructor(status: number, raw: unknown) {
    super("Whop denied this call without naming a missing scope.", status, raw);
    this.name = "WhopUnnamedAuthorizationError";
  }
}

/** Credential error (Section 6.5) — 401, or a 403 not tied to a named or
 * unnamed-authorization pattern. Trips the circuit breaker; never retried
 * against the same credential. */
export class WhopCredentialError extends WhopApiError {
  constructor(status: number, raw: unknown) {
    super("Whop credential is invalid, expired, or revoked.", status, raw);
    this.name = "WhopCredentialError";
  }
}

/** Transient error (Section 6.5) — 429 or 5xx. `retryAfterSeconds` is the
 * literal `Try again in N seconds` hint from the 429 body when present;
 * callers must honor it literally rather than substituting a fixed
 * backoff (Section 5.5/6.1 — Whop returns no X-RateLimit-* headers, so
 * this hint is the only feedback the platform gives). */
export class WhopTransientError extends WhopApiError {
  readonly retryAfterSeconds?: number;
  constructor(status: number, raw: unknown, retryAfterSeconds?: number) {
    super(
      retryAfterSeconds
        ? `Whop asked to retry in ${retryAfterSeconds}s.`
        : "Whop returned a transient error (429/5xx).",
      status,
      raw
    );
    this.name = "WhopTransientError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Validation error (Section 6.5) — 400/422 carrying field-level detail and
 * no authorization prefix. An input mistake, not retryable. */
export class WhopValidationError extends WhopApiError {
  constructor(status: number, raw: unknown) {
    super("Whop rejected the request as invalid.", status, raw);
    this.name = "WhopValidationError";
  }
}

/**
 * Section 8.1's adapter-layer guardrail, half one: a list call whose
 * required scope parameter is absent throws this locally and is never
 * dispatched to Whop at all.
 */
export class ScopeRequiredError extends Error {
  constructor(endpoint: string, param: string) {
    super(`${endpoint} requires "${param}" to be passed explicitly. Refusing to call Whop without it.`);
    this.name = "ScopeRequiredError";
  }
}

/**
 * Section 8.1's adapter-layer guardrail, half two: a list response
 * containing even one record whose account/company id doesn't match the
 * connected account. This is the "confidently wrong result, not an error"
 * failure mode the spec calls the highest-severity guardrail in the whole
 * system (GET /api/v1/products with no account_id returns HTTP 200 full of
 * other businesses' products). Never caught by a fail-open table (Section
 * 8.7's one stated exception) — it hard-fails the run.
 */
export class ScopeViolationError extends Error {
  constructor(endpoint: string, foundAccountId: string, expectedAccountId: string) {
    super(
      `${endpoint} returned a record scoped to account "${foundAccountId}", but this connection is scoped to ` +
        `"${expectedAccountId}". Whop's own scope parameter was ignored or omitted. Hard-failing rather than ` +
        `reporting a result that may belong to a different business.`
    );
    this.name = "ScopeViolationError";
  }
}

/**
 * Section 8.5 — a call dispatched on a credential type its own skill never
 * declared (see whop-agent-skill-manifest.ts's requiredCredential field).
 * Thrown at the adapter, before dispatch, same spirit as ScopeRequiredError:
 * silent credential fallback is how a read-only skill ends up making a
 * user-context call, or vice versa, far from where the mistake was made.
 */
export class CredentialNotDeclaredError extends Error {
  constructor(needed: string, declared: string[]) {
    super(`This call needs a "${needed}" credential, which this skill never declared (declared: ${declared.join(", ") || "none"}).`);
    this.name = "CredentialNotDeclaredError";
  }
}
