import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { db } from "@/lib/db";
import { fakeDb } from "../helpers/fake-db";
import {
  HOSTED_PAGE_CSP,
  buildPlaceholderConfirmationHtml,
  existingPageRedirect,
  hostedPageHeaders,
} from "@/features/pin-down/server/hosted-page";
import { clearedPageColumns } from "@/features/pin-down/server/confirmation-page-store";
import { GET } from "@/app/confirm/[id]/route";

const BUILT = "<!doctype html><html><body><h1>Built for Acme</h1></body></html>";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (id: string, query = "") => GET(new Request(`https://app.test/confirm/${id}${query}`), params(id));

describe("the hosted page's security", () => {
  it("runs in a sandbox without the app's origin, so it can't act as a signed-in user", () => {
    expect(HOSTED_PAGE_CSP).toMatch(/^sandbox allow-scripts /);
    expect(HOSTED_PAGE_CSP).not.toContain("allow-same-origin");
  });

  it("runs only its own inline script, never one loaded from elsewhere", () => {
    expect(HOSTED_PAGE_CSP).toContain("script-src 'unsafe-inline'");
    expect(HOSTED_PAGE_CSP).not.toMatch(/script-src[^;]*https:/);
    expect(HOSTED_PAGE_CSP).toContain("connect-src 'none'");
    expect(HOSTED_PAGE_CSP).toContain("form-action 'none'");
  });

  it("is never indexed and never sniffed as another type", () => {
    const h = new Headers(hostedPageHeaders());
    expect(h.get("X-Robots-Tag")).toContain("noindex");
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Content-Type")).toBe("text/html; charset=utf-8");
  });
});

describe("the placeholder page", () => {
  it("escapes the business name and host", () => {
    const html = buildPlaceholderConfirmationHtml({ buyer: `<img src=x onerror=alert(1)>`, host: `"><script>x</script>` });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("fills in the prospect's details on their device, with sensible wording when none came through", () => {
    const html = buildPlaceholderConfirmationHtml({ buyer: "Acme", host: "Dana" });
    expect(html).toContain("You're booked");
    expect(html).toContain("with Acme");
    expect(html).toContain("You'll meet with <strong>Dana</strong> at the time you picked.");
    expect(html).toContain('data-merge="call_time"');
    expect(html).toContain("new URLSearchParams");
    expect(html).not.toContain("the time you selected");
  });
});

describe("sending prospects to a page the client kept", () => {
  it("carries the booking details over without overwriting the page's own", () => {
    const url = existingPageRedirect("https://acme.com/thanks?ref=ad", "?invitee_first_name=Sam&ref=x");
    expect(url?.toString()).toBe("https://acme.com/thanks?ref=ad&invitee_first_name=Sam");
  });

  it("refuses anything that isn't a web page, and a loop back to a hosted page", () => {
    expect(existingPageRedirect("javascript:alert(1)", "")).toBeNull();
    expect(existingPageRedirect("not a url", "")).toBeNull();
    expect(existingPageRedirect("https://app.test/confirm/eng_1", "")).toBeNull();
  });
});

describe("recording a built page", () => {
  it("records the page and when, and nothing for an empty build", () => {
    expect(clearedPageColumns(null)).toEqual({});
    expect(clearedPageColumns({ html: "  " })).toEqual({});
    const cols = clearedPageColumns({ html: BUILT });
    expect(cols.confirmationPageHtml).toBe(BUILT);
    expect(cols.confirmationPageBuiltAt).toBeInstanceOf(Date);
  });
});

describe("GET /confirm/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves the page Show Rate Setup built, sandboxed", async () => {
    Object.assign(db, fakeDb([{ buyer: "Acme", prospectMeets: "Dana", stack: {}, confirmationPageHtml: BUILT }]));
    const res = await get("eng_acme");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(BUILT);
    expect(res.headers.get("Content-Security-Policy")).toBe(HOSTED_PAGE_CSP);
  });

  it("shows the plain placeholder until a page is built", async () => {
    Object.assign(db, fakeDb([{ buyer: "Acme", prospectMeets: null, stack: {}, confirmationPageHtml: null }]));
    const res = await get("eng_acme");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("with Acme");
    expect(body).toContain("We'll see you at the time you picked.");
  });

  it("sends the prospect to the client's own page when they kept it", async () => {
    Object.assign(
      db,
      fakeDb([{ buyer: "Acme", prospectMeets: null, confirmationPageHtml: BUILT, stack: { existing_confirmation_page_reuse: true, existing_confirmation_page_url: "https://acme.com/thanks" } }])
    );
    const res = await get("eng_acme", "?invitee_first_name=Sam");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://acme.com/thanks?invitee_first_name=Sam");
  });

  it("is not found for an unknown client, and doesn't query for a malformed id", async () => {
    Object.assign(db, fakeDb([]));
    expect((await get("eng_missing")).status).toBe(404);
    const selectSpy = vi.fn();
    Object.assign(db, { select: selectSpy });
    expect((await get("eng%20bad%27")).status).toBe(404);
    expect(selectSpy).not.toHaveBeenCalled();
  });
});
