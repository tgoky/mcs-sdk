import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

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

describe("Lifecycle simulation: sign-in -> Home -> Showtime -> booking -> notification", () => {
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
    // ── Chapter 1: unauthenticated visit is turned away ──────────────────
    vi.doMock("@/lib/session", () => ({
      getSession: vi.fn().mockResolvedValue({}),
    }));
    {
      const DashboardLayout = (await import("@/app/dashboard/layout")).default;
      await expect(DashboardLayout({ children: <div /> })).rejects.toThrow(
        "NEXT_REDIRECT:/api/auth/login"
      );
    }

    // Re-authenticate for the rest of the journey. resetModules() is
    // required here — doMock alone only affects imports that happen after
    // it, and @/app/dashboard/layout (along with everything it transitively
    // imports) is already cached from chapter 1's import above.
    vi.doMock("@/lib/session", () => ({
      getSession: vi.fn().mockResolvedValue({ whopUserId: "user-1", email: "sarah@acme.com" }),
    }));
    vi.resetModules();

    // ── Chapter 2: signs in, lands on the workspace hub ───────────────────
    {
      const WorkspaceHomePage = (await import("@/app/home/page")).default;
      render(await WorkspaceHomePage());
      expect(screen.getByText("Welcome back, sarah")).toBeInTheDocument();
      const showtimeCard = screen.getByRole("heading", { name: "Showtime" }).closest("a")!;
      expect(showtimeCard).toHaveAttribute("href", "/dashboard");
    }

    // ── Chapter 3: opens Showtime — the dashboard shell renders with a
    //    way back Home ───────────────────────────────────────────────────
    {
      cleanup(); // leaving Home, the workspace hub is no longer on screen
      const DashboardLayout = (await import("@/app/dashboard/layout")).default;
      const element = await DashboardLayout({ children: <div>dashboard content</div> });
      await act(async () => {
        render(element);
        await Promise.resolve();
      });
      expect(screen.getByText("Home").closest("a")).toHaveAttribute("href", "/home");
      expect(screen.getByText("dashboard content")).toBeInTheDocument();
    }

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

    // ── Chapter 6: the buyer comes back to the dashboard — the bell picks
    //    up the notification on this fresh mount and they read it ────────
    {
      cleanup();
      global.fetch = vi.fn(async (url: string) => {
        if (url === "/api/notifications") {
          const GET = (await import("@/app/api/notifications/route")).GET;
          const res = await GET();
          return { ok: true, json: async () => res.json() as any };
        }
        return { ok: true, json: async () => ({}) };
      }) as unknown as typeof fetch;

      const { NotificationBell } = await import("@/app/dashboard/notification-bell");
      render(<NotificationBell />);

      expect(await screen.findByText("1")).toBeInTheDocument(); // unread badge
      fireEvent.click(screen.getByLabelText("Notifications"));
      expect(await screen.findByText("Pin-Down couldn't reach Calendly")).toBeInTheDocument();
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
