// A missed startup request must not hide a later release for the whole session.
export function startUpdatePolling(check: () => Promise<void>, target = window, doc = document, online = () => navigator.onLine) {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running || !online() || doc.visibilityState === "hidden") return;
    running = true;
    try { await check(); } catch { /* Retry on reconnect/resume or the next interval. */ }
    finally { running = false; }
  };
  const wake = () => { void run(); };
  const startup = target.setTimeout(wake, 1500);
  const interval = target.setInterval(wake, 5 * 60 * 1000);
  target.addEventListener("online", wake);
  target.addEventListener("focus", wake);
  doc.addEventListener("visibilitychange", wake);
  return () => {
    stopped = true;
    target.clearTimeout(startup);
    target.clearInterval(interval);
    target.removeEventListener("online", wake);
    target.removeEventListener("focus", wake);
    doc.removeEventListener("visibilitychange", wake);
  };
}
