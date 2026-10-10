// Tenant licensing rules. No customer records or local storage are touched here.
const DAY = 86_400_000;
export const DEFAULT_FLAGS = Object.freeze({ uiEnabled: false, newClientRequired: false, existingClientEnforcement: false, verificationEnforcement: false });
export const DEFAULT_PRICING = Object.freeze({ annualPaise: 0, lifetimePaise: 0, annualAvailable: false, lifetimeAvailable: false, upgradeCreditEnabled: false, maxCreditPaise: 0, graceDays: 7, paymentInstructions: "Contact the Master Admin for payment details." });

export function validatePricing(input) {
  const money = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;
  if (!input || !money(input.annualPaise) || !money(input.lifetimePaise) || !money(input.maxCreditPaise) || !Number.isInteger(input.graceDays) || input.graceDays < 0 || input.graceDays > 30 || typeof input.annualAvailable !== "boolean" || typeof input.lifetimeAvailable !== "boolean" || typeof input.upgradeCreditEnabled !== "boolean" || typeof input.paymentInstructions !== "string" || input.paymentInstructions.length > 500) throw new Error("Invalid license pricing settings.");
  if ((input.annualAvailable && !input.annualPaise) || (input.lifetimeAvailable && !input.lifetimePaise)) throw new Error("Available plans require a positive price.");
  return Object.fromEntries(Object.keys(DEFAULT_PRICING).map(key => [key, input[key]]));
}

export function addCalendarYear(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid activation date.");
  const year = date.getUTCFullYear() + 1;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())).toISOString();
}

export function licenseView(license, now, graceDays = 7) {
  if (!license) return { state: "legacy_unreviewed", daysRemaining: null, canWrite: true };
  if (["pending", "suspended", "revoked"].includes(license.status)) return { state: license.status, daysRemaining: null, canWrite: license.status === "pending" ? false : false };
  if (license.status !== "active" || !["annual", "lifetime"].includes(license.plan)) throw new Error("Invalid license state.");
  if (license.plan === "lifetime") return { state: "active", daysRemaining: null, canWrite: true };
  const expiry = Date.parse(license.expiresAt);
  if (!Number.isFinite(expiry)) throw new Error("Invalid license expiry.");
  const days = Math.ceil((expiry - now) / DAY);
  if (days > 30) return { state: "active", daysRemaining: days, canWrite: true };
  if (days > 0) return { state: "expiring_soon", daysRemaining: days, canWrite: true };
  if (now <= expiry + graceDays * DAY) return { state: "grace", daysRemaining: 0, canWrite: true };
  return { state: "expired", daysRemaining: 0, canWrite: false };
}

export function upgradeAmount(pricing, license) {
  if (!pricing.lifetimeAvailable) throw new Error("Lifetime licenses are currently unavailable.");
  const credit = pricing.upgradeCreditEnabled && license?.plan === "annual" ? Math.min(pricing.maxCreditPaise, Math.max(0, license.paidPaise || 0), pricing.lifetimePaise) : 0;
  return { duePaise: pricing.lifetimePaise - credit, creditPaise: credit };
}

export function transitionLicense(current, request, now, pricing) {
  if (!request || !["annual", "lifetime", "renewal", "upgrade"].includes(request.kind)) throw new Error("Invalid license request.");
  const previous = current || { revision: 0, status: "pending" };
  if (request.kind === "renewal" && (current?.plan !== "annual" || current.status === "revoked")) throw new Error("Only an existing annual license can be renewed.");
  if (request.kind === "upgrade" && (current?.plan !== "annual" || current.status === "revoked")) throw new Error("Only an annual license can be upgraded.");
  if (["annual", "lifetime"].includes(request.kind) && current?.status === "active") throw new Error("This tenant already has an active license.");
  const lifetime = ["lifetime", "upgrade"].includes(request.kind);
  const base = request.kind === "renewal" && Date.parse(current.expiresAt) > Date.parse(now) ? current.expiresAt : now;
  return {
    ...previous, plan: lifetime ? "lifetime" : "annual", status: "active",
    activatedAt: current?.activatedAt || now, expiresAt: lifetime ? null : addCalendarYear(base),
    paidPaise: request.quotedPaise, revision: (previous.revision || 0) + 1,
    updatedAt: now, lastRequestId: request.id,
  };
}

export function validateInquiry(input) {
  if (!input || typeof input !== "object") throw new Error("Enter valid contact details.");
  const s = (key, max) => typeof input[key] === "string" && input[key].trim().length <= max ? input[key].trim() : null;
  const name = s("name", 100), mobile = s("mobile", 20), email = s("email", 254), bankName = s("bankName", 120);
  const location = s("location", 120), message = s("message", 500);
  if (!name || !bankName || !mobile || !/^\+?[0-9][0-9\s-]{7,18}$/.test(mobile) || email === null || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || location === null || message === null || !["annual", "lifetime", "undecided"].includes(input.plan) || !/^[a-f0-9-]{36}$/.test(input.requestId || "")) throw new Error("Enter valid contact details and a request ID.");
  return { name, mobile, email, bankName, location, message, plan: input.plan, requestId: input.requestId };
}
