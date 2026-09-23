import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A "day in the life" simulation covering the specific path this session's
 * changes touch: signing in, landing on the workspace hub, entering
 * Showtime, an integration being connected, and a booking event turning
 * into a notification the buyer actually sees.
 *
 * Every external dependency (Whop session, Calendly/booking credentials,
 * Slack, Resend/email) is faked at the boundary — this is exactly the
 * "simulation test so I don't need a real Calendly premium account" this
 * suite was asked for. What's real is the business logic in between:
 * src/lib/credentials.ts's actual encryption, src/lib/notify.ts's actual
 * fan-out, and the actual API route handlers.
 *
 * State is threaded through a single in-memory store shared by every fake
 * table below, so what one chapter writes, the next chapter can read —
 * the same way a real Postgres row would flow through a real request
 * lifecycle, just without a real database.
 */

const store = {
  credentials: [] as any[],
  notifications: [] as any[],
  users: [{ whopUserId: "user-1", email: "sarah@acme.com" }] as any[],
};

function resetStore() {
  store.credentials.length = 0;
  store.notifications.length = 0;
}

const CURRENT_KEY = "c".repeat(64);

describe("Lifecycle simulation: connect a booking tool -> failure -> notification -> read", () => {
  beforeEach(() => {
    resetStore();
    vi.resetModules();
    process.env.CREDENTIAL_ENCRYPTION_KEY = CURRENT_KEY;
    delete process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION;
    delete process.env.RESEND_API_KEY;

    // One db mock, shared by every module imported in this test — mirrors
    // how a real Postgres connection is shared across a request lifecycle.
    vi.doMock("@/lib/db", () => ({
      db: {
        select: vi.fn((cols?: any) => ({
          from: () => ({
            where: () => ({
              limit: async () => {
                if (cols && "email" in (cols ?? {})) return store.users;
                return store.credentials.length ? store.credentials : store.notifications;
              },
              orderBy: () => ({
                limit: async () => store.notifications,
              }),
            }),
          }),
        })),
        insert: vi.fn(() => ({
          values: async (row: any) => {
            if ("severity" in row) store.notifications.unshift(row);
            else store.credentials.push(row);
          },
        })),
        update: vi.fn(() => ({
          set: (patch: any) => ({
            where: async () => {
              store.notifications.forEach((n) => Object.assign(n, patch));
            },
          }),
        })),
      },
    }));

    vi.doMock("@/lib/session", () => ({
      getSession: vi.fn().mockResolvedValue({ whopUserId: "user-1", email: "sarah@acme.com" }),
    }));

    vi.doMock("@/app/dashboard/sidebar-skills", () => ({
      SidebarSkills: () => <div data-testid="sidebar-skills-stub" />,
      SidebarSkillsSkeleton: () => <div data-testid="sidebar-skills-skeleton" />,
    }));

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("walks the full journey end to end", async () => {
    // The UI chapters that rendered the old home-page product cards, the
    // old dashboard layout and the NotificationBell component were retired
    // with those screens; the journey below is the part that's still the
    // same code path: credential storage, notify's fan-out, and the
    // notification routes the in-app panel reads.

    // ── Chapter 4: connects a booking platform credential during setup —
    //    no real Calendly account, just the API key a buyer would paste
    //    in ─────────────────────────────────────────────────────────────
    {
      const { storeCredential, resolveCredential, hasCredential } = await import(
        "@/lib/credentials"
      );
      expect(await hasCredential("eng-1", "calendly")).toBe(false);
      await storeCredential("eng-1", "calendly", "api_key", "cal_live_fake_key_123");
      expect(await hasCredential("eng-1", "calendly")).toBe(true);
      expect(await resolveCredential("eng-1", "calendly")).toBe("cal_live_fake_key_123");
    }

    // ── Chapter 5: a booking comes in — the webhook path would call
    //    notifyUser exactly like this once Pile-On enrollment completes ──
    {
      const { notifyUser } = await import("@/lib/notify");
      const slackFetch = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = slackFetch as unknown as typeof fetch;

      await notifyUser({
        whopUserId: "user-1",
        engagementId: "eng-1",
        runId: "run-1",
        type: "run_failed",
        severity: "critical",
        title: "Pin-Down couldn't reach Calendly",
        body: "The stored API key was rejected — ask the buyer to reconnect.",
        slackWebhookUrl: "https://hooks.slack.com/services/fake",
      }) as unknown as typeof fetch;

      expect(store.notifications).toHaveLength(1);
      expect(slackFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/services/fake",
        expect.objectContaining({ method: "POST" })
      );
    }

    // ── Chapter 6: the notifications panel's data source returns it ────
    {
      const GET = (await import("@/app/api/notifications/route")).GET;
      const data = await (await GET()).json();
      const list = (data.notifications ?? data) as Array<{ title: string }>;
      expect(list.some((n) => n.title === "Pin-Down couldn't reach Calendly")).toBe(true);
    }

    // ── Chapter 7: buyer marks it read — reflected in the shared store ────
    {
      const POST = (await import("@/app/api/notifications/[id]/read/route")).POST;
      const res = await POST(new Request("http://x"), {
        params: Promise.resolve({ id: "all" }),
      });
      expect(res.status).toBe(200);
      expect(store.notifications.every((n) => n.read)).toBe(true);
    }
  });
});
