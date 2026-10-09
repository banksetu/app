/* =========================================================
   BANK SETU — SMART SYNC ENGINE (v1)

   Goals:
   - Idle remote reconciliation at most once every 60 minutes.
   - Immediate local save + prompt cloud upload for customer
     changes (Add / Edit / Delete / Status / Photo).
   - Durable pending-op queue with automatic retry, idempotent
     operations and exponential backoff with jitter.
   - Firebase ID tokens reused from the Auth SDK cache; forced
     refresh only on genuine auth-recovery.
   - In-flight request deduplication (protects Cloudflare Worker
     and Apps Script from duplicate calls).
   - No background scheduler loops while idle: timers are armed
     only when there is real work; the hourly reconciliation uses
     a persisted timestamp so app reloads never re-download.

   This module is intentionally dependency-light (pure browser
   APIs + firebase/auth cached token) so it can be unit tested
   with fake timers and mocked fetch.
   ========================================================= */

import { getAuth } from "firebase/auth";

/* ---------------- Types ---------------- */

export type SyncOpKind =
  | "saveCustomer"
  | "updateCustomer"
  | "deleteCustomer"
  | "markPassbookDelivered"
  | "photoUpload";

export type PendingOp = {
  opId: string;          // stable operation id (idempotency key)
  kind: SyncOpKind;
  payload: Record<string, unknown>;
  entityKey: string;     // e.g. rowNumber or customer id — used to coalesce
  createdAt: number;
  attempts: number;
  lastError?: string;
  permanent?: boolean;   // validation/permission failure — stop retrying
};

export type SyncStatus = {
  pendingCount: number;
  permanentFailureCount: number;
  paused: boolean;
  syncing: boolean;
  lastReconciledAt: number | null;
  nextRetryAt: number | null;
  queuedOps: Array<{ opId: string; kind: string; attempts: number; permanent: boolean }>;
};

type BridgeResult = {
  success?: boolean;
  message?: string;
  code?: string;
  [key: string]: unknown;
};

/* ---------------- Constants ---------------- */

/** Idle Google-Sheet reconciliation interval: 60 minutes. */
export const RECONCILE_INTERVAL_MS = 60 * 60 * 1000;

/** Minimum gap between immediate flushes of rapid successive edits. */
const FLUSH_DEBOUNCE_MS = 2000;

/** Base backoff for temporary failures (×2 each attempt, ±30% jitter). */
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;

/** Queue persistence keys (per-device, survives reload/restart). */
const Q_KEY = "bankSetuSyncQueueV1";
const META_KEY = "bankSetuSyncMetaV1";

/** Error codes that must NOT be retried (permanent). */
const PERMANENT_CODES = new Set([
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "PERMISSION_DENIED",
  "INVALID_ACTION",
  "VALIDATION",
  "TENANT_MISMATCH",
]);

/* ---------------- Internal state ---------------- */

let queue: PendingOp[] | null = null;      // lazy load
let meta: { lastReconciledAt: number | null } = { lastReconciledAt: null };
let paused = false;
let syncing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let bridgeUrlOverride: string | null = null;
let statusListeners: Array<(s: SyncStatus) => void> = [];

/* Token cache: reuse the Auth SDK's cached ID token; single-flight
   refresh so overlapping sync attempts never double-hit Firebase. */
let tokenCache: { value: string; exp: number } | null = null;
let tokenInFlight: Promise<string> | null = null;

/* Dedupe identical in-flight POSTs (same serialized body). */
const inflightPosts = new Map<string, Promise<BridgeResult>>();

/* ---------------- Storage helpers ---------------- */

function loadQueue(): PendingOp[] {
  if (queue) return queue;
  try {
    const raw = localStorage.getItem(Q_KEY);
    queue = raw ? (JSON.parse(raw) as PendingOp[]) : [];
    if (!Array.isArray(queue)) queue = [];
  } catch {
    queue = [];
  }
  return queue;
}

function persist() {
  try {
    localStorage.setItem(Q_KEY, JSON.stringify(loadQueue()));
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* storage full / unavailable — keep in-memory state */
  }
}

function getBridgeUrl(): string {
  if (bridgeUrlOverride) return bridgeUrlOverride;
  return (localStorage.getItem("bankSetuApiUrl") || "").trim();
}

/* ---------------- Time / backoff ---------------- */

function now(): number {
  return Date.now();
}

export function backoffFor(attempts: number): number {
  const base = Math.min(
    BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)),
    BACKOFF_MAX_MS
  );
  const jitter = base * 0.3 * Math.random();
  return Math.round(base + jitter);
}

/* ---------------- Firebase token (Task 5) ---------------- */

async function getIdTokenCached(forceRefresh = false): Promise<string> {
  const fresh = !forceRefresh && tokenCache && tokenCache.exp > now() + 60_000;
  if (fresh && tokenCache) return tokenCache.value;

  if (tokenInFlight && !forceRefresh) return tokenInFlight;

  const user = getAuth().currentUser;
  if (!user) throw new Error("Login session expired. Please login again.");

  tokenInFlight = (async () => {
    try {
      // Firebase SDK itself caches tokens; passing true only during
      // genuine recovery avoids extra secure-token-endpoint traffic.
      const token = await user.getIdToken(forceRefresh);
      const payload = decodeJwtPayload(token);
      tokenCache = {
        value: token,
        exp: payload?.exp ? payload.exp * 1000 : now() + 55 * 60_000,
      };
      return token;
    } finally {
      tokenInFlight = null;
    }
  })();

  return tokenInFlight;
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

function invalidateTokenCache() {
  tokenCache = null;
}

/* ---------------- Bridge request (Tasks 5–7) ---------------- */

async function postToBridge(
  body: Record<string, unknown>,
  opts: { forceTokenRefresh?: boolean } = {}
): Promise<BridgeResult> {
  const apiUrl = getBridgeUrl();
  if (!apiUrl) throw new Error("Google Sheet API URL is not configured.");

  const idToken = await getIdTokenCached(opts.forceTokenRefresh === true);
  const serialized = JSON.stringify({ ...body, idToken });

  const existing = inflightPosts.get(serialized);
  if (existing) return existing; // dedupe identical concurrent requests

  const p = (async () => {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: serialized,
      });
      if (response.status === 401) {
        invalidateTokenCache();
        const err = new Error("Authentication expired.") as Error & {
          authRecovery?: boolean;
        };
        err.authRecovery = true;
        throw err;
      }
      if (response.status === 429 || response.status >= 500) {
        let retryAfterMs: number | null = null;
        const ra = response.headers.get("Retry-After");
        if (ra) {
          const secs = Number(ra);
          if (!Number.isNaN(secs)) retryAfterMs = secs * 1000;
        }
        const err = new Error(
          `Temporary remote failure (HTTP ${response.status}).`
        ) as Error & { retryAfterMs?: number | null };
        err.retryAfterMs = retryAfterMs;
        throw err;
      }
      return (await response.json()) as BridgeResult;
    } finally {
      inflightPosts.delete(serialized);
    }
  })();

  inflightPosts.set(serialized, p);
  return p;
}

/* ---------------- Queue management (Tasks 3, 9, 10) ---------------- */

function genOpId(kind: string): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${kind}-${crypto.randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  return `${kind}-${now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function enqueue(op: Omit<PendingOp, "createdAt" | "attempts">): PendingOp {
  const q = loadQueue();
  const full: PendingOp = { ...op, createdAt: now(), attempts: 0 };
  q.push(full);
  persist();
  return full;
}

function removeOp(opId: string) {
  const q = loadQueue();
  const idx = q.findIndex((o) => o.opId === opId);
  if (idx >= 0) {
    q.splice(idx, 1);
    persist();
  }
}

/** Coalesce: if an unpersisted op for the same entity+kind already
 *  exists, replace its payload instead of duplicating uploads. */
function upsertQueuedOp(
  kind: SyncOpKind,
  entityKey: string,
  payload: Record<string, unknown>
) {
  const q = loadQueue();
  const existing = q.find(
    (o) => o.entityKey === entityKey && o.kind === kind && !o.permanent
  );
  if (existing) {
    existing.payload = payload; // latest-wins for same-kind edits
    persist();
    return existing;
  }
  return enqueue({
    opId: genOpId(kind),
    kind,
    entityKey,
    payload,
  });
}

/* ---------------- Op execution ---------------- */

function classifyError(err: unknown): {
  permanent: boolean;
  authRecovery: boolean;
  retryAfterMs: number | null;
  message: string;
} {
  const e = err as Error & { authRecovery?: boolean; retryAfterMs?: number | null };
  return {
    permanent: false,
    authRecovery: e?.authRecovery === true,
    retryAfterMs: e?.retryAfterMs ?? null,
    message: e?.message ? String(e.message) : "Unknown sync error.",
  };
}

async function runOp(
  op: PendingOp
): Promise<{ done: boolean; permanent?: boolean; message?: string }> {
  let result: BridgeResult;
  try {
    result = await postToBridge({ action: op.kind, ...op.payload });
  } catch (err) {
    const c = classifyError(err);
    if (c.authRecovery) {
      // One bounded recovery attempt with a genuinely refreshed token.
      try {
        result = await postToBridge(
          { action: op.kind, ...op.payload },
          { forceTokenRefresh: true }
        );
      } catch (err2) {
        const c2 = classifyError(err2);
        op.attempts += 1;
        op.lastError = c2.message;
        persist();
        scheduleRetry(c2.retryAfterMs ?? backoffFor(op.attempts));
        return { done: false };
      }
    } else {
      op.attempts += 1;
      op.lastError = c.message;
      persist();
      scheduleRetry(c.retryAfterMs ?? backoffFor(op.attempts));
      return { done: false };
    }
  }

  if (result && result.success) {
    removeOp(op.opId);
    return { done: true };
  }

  const code = result?.code || "";
  if (PERMANENT_CODES.has(code)) {
    op.permanent = true;
    op.lastError = result?.message || "Rejected by server.";
    persist();
    notifyStatus();
    return { done: true, permanent: true, message: op.lastError };
  }

  // Business rejection without known permanent code → temporary.
  op.attempts += 1;
  op.lastError = result?.message || "Request could not be completed.";
  persist();
  return { done: false };
}

/* ---------------- Flush / scheduler (Task 9) ---------------- */

function armFlush() {
  if (paused) return;
  if (flushTimer) return; // debounce rapid successive actions
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_DEBOUNCE_MS);
}

function scheduleRetry(delayMs: number) {
  if (paused || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushQueue();
  }, delayMs);
}

async function flushQueue(): Promise<void> {
  if (inFlight) return inFlight; // no overlapping sync jobs per tenant
  const run = async () => {
    syncing = true;
    notifyStatus();
    try {
      const q = loadQueue();
      for (const op of [...q]) {
        if (op.permanent) continue; // surfaced via status, not retried
        if (paused) break;
        const res = await runOp(op);
        if (!res.done) break; // temporary failure → backoff scheduled
      }
    } finally {
      syncing = false;
      inFlight = null;
      persist();
      notifyStatus();
      armReconcileTimerIfNeeded();
      // If ops remain and no timer was scheduled, arm a safe retry.
      const remaining = loadQueue().filter((o) => !o.permanent).length;
      if (remaining > 0 && !retryTimer && !flushTimer && !paused) {
        scheduleRetry(backoffFor(1));
      }
    }
  };
  inFlight = run();
  return inFlight;
}

/* ---------------- Reconciliation (Task 2) ---------------- */

function armReconcileTimerIfNeeded() {
  if (reconcileTimer || paused) return;
  const last = meta.lastReconciledAt ?? 0;
  const due = last + RECONCILE_INTERVAL_MS - now();
  const delay = Math.max(due, 0);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void reconcile("idle");
  }, delay);
}

/** Actual remote reconciliation tick. Cheap by design: one bridge
 *  call per hour (server-side change-marker check) — never repeated
 *  page downloads while idle. The UI layer may use the returned
 *  marker to trigger targeted pulls only when data actually changed. */
async function reconcile(
  reason: "idle" | "manual" | "reconnect"
): Promise<BridgeResult> {
  const result: BridgeResult = { success: true, reconciledAt: now(), reason };
  try {
    if (loadQueue().some((o) => !o.permanent)) {
      await flushQueue();
    }
    // Skipped entirely while offline to avoid pointless Worker hits.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ...result, skippedOffline: true };
    }
    const lastKnown = localStorage.getItem("bankSetuRemoteMarker") || "";
    const r = await postToBridge({
      action: "getSyncStatus",
      lastKnownMarker: lastKnown,
    }).catch(() => ({ success: false, message: "reconcile probe failed" }));
    if (r && r.success) {
      if (typeof r.marker === "string" && r.marker && r.marker !== lastKnown) {
        localStorage.setItem("bankSetuRemoteMarker", r.marker);
        result.changed = true; // consumer may do a targeted pull
      }
      meta.lastReconciledAt = now();
      persist();
    }
  } finally {
    armReconcileTimerIfNeeded();
    notifyStatus();
  }
  return result;
}

/* ---------------- Public API ---------------- */

export const syncEngine = {
  /** Register a customer mutation. Commits to durable queue and
   *  schedules a prompt (debounced ~2 s) upload. Returns the op. */
  enqueueCustomerChange(
    kind: SyncOpKind,
    entityKey: string,
    payload: Record<string, unknown>
  ): PendingOp {
    const op = upsertQueuedOp(kind, entityKey, payload);
    armFlush();
    notifyStatus();
    return op;
  },

  /** Manual sync: bypass idle interval, flush queue + reconcile now. */
  manualSync(): Promise<BridgeResult> {
    return reconcile("manual");
  },

  /** Called on internet reconnect: flush pending, then reconcile. */
  onOnline(): void {
    invalidateTokenCache(); // session may have expired while offline
    if (loadQueue().some((o) => !o.permanent)) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      void flushQueue();
    }
    const last = meta.lastReconciledAt ?? 0;
    if (now() - last >= RECONCILE_INTERVAL_MS) {
      void reconcile("reconnect");
    }
  },

  onOffline(): void {
    // Nothing to do: queue is durable; failing requests fall back
    // into bounded exponential backoff automatically.
  },

  /** Pause/resume honoring the existing user control. */
  setPaused(value: boolean): void {
    paused = value;
    if (value) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (reconcileTimer) { clearTimeout(reconcileTimer); reconcileTimer = null; }
    } else {
      if (loadQueue().some((o) => !o.permanent)) armFlush();
      armReconcileTimerIfNeeded();
    }
    persist();
    notifyStatus();
  },

  isPaused(): boolean {
    return paused;
  },

  getStatus(): SyncStatus {
    const q = loadQueue();
    return {
      pendingCount: q.filter((o) => !o.permanent).length,
      permanentFailureCount: q.filter((o) => o.permanent).length,
      paused,
      syncing,
      lastReconciledAt: meta.lastReconciledAt,
      nextRetryAt: null,
      queuedOps: q.map((o) => ({
        opId: o.opId,
        kind: o.kind,
        attempts: o.attempts,
        permanent: !!o.permanent,
      })),
    };
  },

  subscribeStatus(fn: (s: SyncStatus) => void): () => void {
    statusListeners.push(fn);
    fn(syncEngine.getStatus());
    return () => {
      statusListeners = statusListeners.filter((f) => f !== fn);
    };
  },

  /** Start engine (idempotent). Restores persisted queue/meta so an
   *  app reload does NOT immediately re-download anything. */
  start(): void {
    meta = (() => {
      try {
        const raw = localStorage.getItem(META_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.lastReconciledAt === "number") {
            return parsed;
          }
        }
      } catch {
        /* ignore */
      }
      return { lastReconciledAt: null };
    })();
    loadQueue();
    if (loadQueue().some((o) => !o.permanent)) armFlush();
    armReconcileTimerIfNeeded();
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => syncEngine.onOnline());
      window.addEventListener("offline", () => syncEngine.onOffline());
    }
  },

  /** Test helper: clear all timers/state. */
  resetForTests(): void {
    if (flushTimer) clearTimeout(flushTimer);
    if (retryTimer) clearTimeout(retryTimer);
    if (reconcileTimer) clearTimeout(reconcileTimer);
    flushTimer = retryTimer = reconcileTimer = null;
    inFlight = null;
    syncing = false;
    paused = false;
    queue = null;
    meta = { lastReconciledAt: null };
    tokenCache = null;
    tokenInFlight = null;
    inflightPosts.clear();
    statusListeners = [];
    bridgeUrlOverride = null;
  },

  /** Test helper: inject bridge URL without localStorage coupling. */
  setBridgeUrlForTests(url: string) {
    bridgeUrlOverride = url;
  },

  /** Direct authenticated bridge call for UI flows (search etc.).
   *  Uses cached token; never forces refresh. */
  bridgeCall(body: Record<string, unknown>): Promise<BridgeResult> {
    return postToBridge(body);
  },

  /** Immediate (non-debounced) upload attempt — used right after
   *  explicit user actions when the UI wants fastest cloud push. */
  flushNow(): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    return flushQueue();
  },
};

function notifyStatus() {
  const s = syncEngine.getStatus();
  for (const fn of statusListeners) {
    try {
      fn(s);
    } catch {
      /* listener errors must not break sync */
    }
  }
}
