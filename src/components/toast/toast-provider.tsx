"use client";

// The generic "that actually did something" signal every enable/save/
// delete action in this app was missing — most of them just called
// router.refresh() on success and left the user to notice a re-rendered
// button, or nothing changed at all if the update was purely server-
// side state. Mounted once in dashboard/layout.tsx (survives route
// changes, same reasoning as TourProvider) so any client component
// anywhere under /dashboard can call useToast().success(...) without
// its own portal/state plumbing.
//
// Deliberately NOT the same corner as booking-toast.tsx's real-time
// booking/rebooking alerts (top-right) — this stack lives bottom-right
// so a "Saved" confirmation from something you just clicked never
// visually collides with an unrelated live event arriving at the same
// moment.

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, X } from "lucide-react";

interface ToastEntry {
  id: number;
  kind: "success" | "error";
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const LIFETIME_MS = 3200;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastEntry["kind"], message: string) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => dismiss(id), LIFETIME_MS);
    },
    [dismiss]
  );

  const value: ToastContextValue = {
    success: useCallback((message: string) => push("success", message), [push]),
    error: useCallback((message: string) => push("error", message), [push]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-[9996] flex flex-col-reverse gap-2 w-72 pointer-events-none font-sans antialiased">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border shadow-lg px-3 py-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 ${
                  t.kind === "success"
                    ? "bg-background border-emerald-200 dark:border-emerald-900/60"
                    : "bg-background border-rose-200 dark:border-rose-900/60"
                }`}
              >
                {t.kind === "success" ? (
                  <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={16} className="text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                )}
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 leading-snug flex-1 min-w-0">{t.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer shrink-0 -m-0.5 p-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
