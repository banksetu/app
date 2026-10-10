import { auth } from "../firebase";
import { callBankSetuWorker } from "../workerApi";
import { cachedLicenseReceipt, saveLicenseReceipt, verifyLicenseReceipt, type LicenseReceipt } from "./licenseReceipt";

const indiaDay = (time: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
let verification: Promise<void> | undefined;
let verificationKey = "";

/** Protect every new local business mutation with the tenant's signed entitlement. */
export async function requireLicensedWrite(): Promise<void> {
  if (sessionStorage.getItem("bankSetuLicenseRequired") !== "true") return;
  const uid = auth.currentUser?.uid;
  const tenantId = sessionStorage.getItem("bankSetuTenantId");
  if (!uid || !tenantId) throw new Error("Sign in to the licensed client workspace again.");
  if (sessionStorage.getItem("bankSetuLicenseReadOnly") === "true") throw new Error("Your Bank Setu license is pending or expired. Please renew or activate your license to continue.");
  const key = `${uid}:${tenantId}`;
  if (verification && verificationKey === key) return verification;
  verificationKey = key;
  const task = (async () => {
    let claims;
    try { claims = await cachedLicenseReceipt(uid, tenantId); } catch { /* Online verification may renew the receipt. */ }
    if (navigator.onLine && (!claims || indiaDay(claims.issuedAt) !== indiaDay(Date.now()))) {
      const result = await callBankSetuWorker<{ view: { canWrite: boolean }; receipt: LicenseReceipt | null }>("/license-me", {});
      if (auth.currentUser?.uid !== uid || sessionStorage.getItem("bankSetuTenantId") !== tenantId) throw new Error("The signed-in workspace changed.");
      if (!result.view.canWrite || !result.receipt) throw new Error("Your Bank Setu license is pending or expired. Please renew or activate your license to continue.");
      claims = await verifyLicenseReceipt(result.receipt, uid, tenantId);
      saveLicenseReceipt(result.receipt, uid, tenantId);
    }
    if (!claims || !["active", "expiring_soon"].includes(claims.state)) throw new Error("Connect to the internet to verify your Bank Setu license.");
    if (auth.currentUser?.uid !== uid || sessionStorage.getItem("bankSetuTenantId") !== tenantId || sessionStorage.getItem("bankSetuLicenseRequired") !== "true") throw new Error("The signed-in workspace changed.");
  })();
  verification = task;
  try { await task; } finally { if (verification === task) verification = undefined; }
}
