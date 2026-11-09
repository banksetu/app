/**
 * The bootstrap loader is rendered by index.html OUTSIDE React's root.
 * React hydration/re-renders cannot unmount or restart its animation.
 * A ready UI calls this only after the real route has committed.
 * Security/session/license readiness remains owned by App.tsx.
 */
let completionRequested = false;

export function startupSplashVisible(): boolean {
  return typeof document !== "undefined" && Boolean(document.getElementById("banksetu-bootstrap-loader"));
}

export function finishStartupSplash(): void {
  if (completionRequested || typeof document === "undefined") return;
  const loader = document.getElementById("banksetu-bootstrap-loader");
  if (!loader) return;
  completionRequested = true;
  loader.dataset.complete = "true";
  loader.setAttribute("aria-label", "Bank Setu workspace ready");
  // 100% represents a committed real screen, never an unverified login.
  // The final fill is visible briefly before the screen is uncovered.
  window.setTimeout(() => {
    loader.remove();
  }, 320);
}
