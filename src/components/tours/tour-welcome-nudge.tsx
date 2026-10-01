"use client";

// The proactive half of onboarding — first-time users don't reliably
// notice a small icon next to the breadcrumb trail, so this shows once,
// unprompted, on the dashboard home for a workspace that's never touched
// a tour (which in practice means right after creating a new client —
// workspace creation always redirects to /dashboard, and a brand-new
// engagement has no tour progress yet). A real modal (not an inline
// banner) so it reads as a deliberate "you're new here, pick a path"
// moment. Laid out like a product-announcement card: the UTP logo and a
// one-line caption on one background, then a title, a short paragraph and
// two buttons. Only the app's own surface, border and ink-button tokens.
//
// The second button is state-aware rather than a blind "set up your first
// worker": workspace creation (/home/new) already makes the caller pick
// at least one product before the workspace exists at all, so by the time
// this shows, "set up your first worker" is frequently already false —
// telling someone that right after they just installed something reads
// as the modal not having noticed. dashboard/page.tsx passes down what's
// actually installed and enabled so this can say the true next step:
// nothing installed -> go install one; installed but nothing enabled yet
// -> finish configuring what's already there; already running something
// -> there's no "first worker" step left, so that button disappears and
// the walkthrough stands alone.
//
// Dismissing it (either button, Escape, the backdrop, or the X) is
// remembered the same way real tour progress is — see tour-provider.tsx's
// dismissWelcome — so it never nags twice. The breadcrumb launcher
// (tour-launcher.tsx) stays there permanently either way, for anyone who
// skips this and wants a tour later.
//
// It's a proper dialog: labelled, focus moves to the main action when it
// opens, Tab stays inside it, and Escape closes it.

import { useEffect, useRef, type Ref } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useTour } from "./tour-provider";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";

export interface WelcomeSetupAction {
  label: string;
  href: string;
}

/** The dialog itself, without the portal or any app state, so it can be
 * rendered on its own. */
export function WelcomeDialog({
  setupAction,
  onStart,
  onSetup,
  onDismiss,
  dialogRef,
  primaryRef,
}: {
  setupAction: WelcomeSetupAction | null;
  onStart: () => void;
  onSetup: () => void;
  onDismiss: () => void;
  dialogRef?: Ref<HTMLDivElement>;
  primaryRef?: Ref<HTMLButtonElement>;
}) {
  const buttonBase =
    "inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-lg px-6 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer sm:w-auto";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-desc"
      className="relative my-8 w-full max-w-[480px] overflow-hidden rounded-2xl border border-border bg-background font-sans antialiased text-foreground shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200 dark:bg-zinc-900"
    >
      {/* Logo and caption share one background. The logo is a near-white
          wordmark, so it's inverted to ink on the light theme. */}
      <div className="relative bg-zinc-100 dark:bg-zinc-950">
        <div className="flex h-[228px] items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo.png"
            alt="United Tools Platform"
            className="h-40 w-auto select-none object-contain invert dark:invert-0"
            draggable={false}
          />
        </div>
        <p className="flex h-[42px] items-center justify-center text-[14px] text-zinc-600 dark:text-zinc-300">Your workspace is ready.</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="absolute right-6 top-6 flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900/60 text-white transition-colors hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/15 dark:hover:bg-white/25 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative px-8 pb-[23px] pt-6 text-center">
        {/* The dashboard's micro dot grid. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-dot-grid" />
        <h2 id="welcome-title" className="relative text-[20px] font-medium leading-[29px]">
          Welcome to United Tools Platform
        </h2>
        <p id="welcome-desc" className="relative mt-1.5 text-[14px] leading-[22px]">
          Take a quick walkthrough of the dashboard, the Library and every worker, or go straight to setting up. You can start the tour again
          anytime from the icon next to the breadcrumbs.
        </p>

        <div className="relative mt-8 flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
          {setupAction && (
            <button type="button" onClick={onSetup} className={`${buttonBase} border border-border bg-background hover:bg-zinc-100 dark:bg-transparent dark:hover:bg-zinc-800`}>
              {setupAction.label}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={onStart}
            className={`${buttonBase} bg-primary text-primary-foreground hover:bg-[var(--ink-hover)]`}
          >
            Take the tour
          </button>
        </div>
      </div>
    </div>
  );
}

export function TourWelcomeNudge({
  installedProductIds,
  hasEnabledAnyWorker,
}: {
  /** Product ids already installed in this workspace — createWorkspace
   * requires picking at least one, so this is normally non-empty by the
   * time a brand-new workspace lands here. */
  installedProductIds: string[];
  /** Whether the workspace's primary engagement has any worker actually
   * enabled yet — true means there's no "set up a worker" step left to
   * offer at all, installed or not. */
  hasEnabledAnyWorker: boolean;
}) {
  const router = useRouter();
  const { tours, hasSeenWelcome, start, dismissWelcome } = useTour();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const fullWalkthrough = tours.find((t) => t.id === "full-walkthrough");
  const show = !hasSeenWelcome && Boolean(fullWalkthrough);

  const installedProducts = WORKSPACE_PRODUCTS.filter((p) => installedProductIds.includes(p.id));

  // Escape closes, Tab stays inside the dialog, the page behind doesn't
  // scroll, and the main action gets focus. Same contract as
  // components/modal.tsx, kept local since this is the only consumer that
  // needs the larger chrome below. The hook still runs every render
  // regardless of `show` so hook order never changes across renders.
  useEffect(() => {
    if (!show) return;
    primaryRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismissWelcome();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [show, dismissWelcome]);

  if (!show || typeof document === "undefined") return null;

  // Three real states, not one generic "set up your first worker" line:
  //  - nothing enabled yet, exactly one product installed -> name it and
  //    send them straight to that product's own Library page.
  //  - nothing enabled yet, several installed -> the Library index; none
  //    installed -> the Library index too, worded as installing one.
  //  - something's already enabled -> there's no setup step left to
  //    offer, so that button is omitted entirely rather than shown stale.
  const setupAction: WelcomeSetupAction | null = hasEnabledAnyWorker
    ? null
    : installedProducts.length === 1
      ? { label: `Set up ${installedProducts[0].name}`, href: `/dashboard/library/${installedProducts[0].id}` }
      : installedProducts.length > 1
        ? { label: "Set up your workers", href: "/dashboard/library" }
        : { label: "Install a product", href: "/dashboard/library" };

  function goToSetupAction() {
    dismissWelcome();
    if (setupAction) router.push(setupAction.href);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px] dark:bg-black/60 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismissWelcome();
      }}
    >
      <WelcomeDialog
        setupAction={setupAction}
        onStart={() => start(fullWalkthrough!.id)}
        onSetup={goToSetupAction}
        onDismiss={dismissWelcome}
        dialogRef={dialogRef}
        primaryRef={primaryRef}
      />
    </div>,
    document.body
  );
}
