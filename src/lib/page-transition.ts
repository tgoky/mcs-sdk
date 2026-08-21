const TRANSITION_KEY = "mv-page-transition";

export function triggerExitTransition() {
  sessionStorage.setItem(TRANSITION_KEY, Date.now().toString());
}

export function hasPendingTransition(): boolean {
  const raw = sessionStorage.getItem(TRANSITION_KEY);
  if (!raw) return false;
  // Auto-expire after 4s so stale states never linger
  if (Date.now() - parseInt(raw, 10) > 4000) {
    sessionStorage.removeItem(TRANSITION_KEY);
    return false;
  }
  return true;
}

export function clearTransition() {
  sessionStorage.removeItem(TRANSITION_KEY);
}