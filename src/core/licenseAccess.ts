import { auth } from "../firebase";
import { callBankSetuWorker } from "../workerApi";
import { cachedLicenseReceipt, saveLicenseReceipt, verifyLicenseReceipt, type LicenseReceipt } from "./licenseReceipt";

const indiaDay = (time: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
const ONLINE_WRITE_VERIFICATION_MS=15*60_000;
let verification: Promise<void> | undefined;
let verificationKey = "";

export const isTemporaryLicenseFailure = (error: unknown): boolean => {
  const status=(error as {status?:number})?.status;
  return status===429 || (typeof status==="number" && status>=500) || error instanceof TypeError ||
    (error instanceof Error && (error.name==="TimeoutError" || error.name==="AbortError"));
};

/** Protect every new local business mutation with the tenant's signed entitlement. */
export async function requireLicensedWrite(): Promise<void> {
  const required = sessionStorage.getItem("bankSetuLicenseRequired");
  if (required === "false") return; // Existing approved legacy workspaces remain available during rollout.
  if (required !== "true") throw new Error("Verify your account and license before changing customer data.");
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
    if (navigator.onLine && (!claims || indiaDay(claims.issuedAt) !== indiaDay(Date.now()) || Date.now()-claims.issuedAt>=ONLINE_WRITE_VERIFICATION_MS)) {
      let result: { view: { canWrite: boolean }; receipt: LicenseReceipt | null };
      try { result = await callBankSetuWorker("/license-me", {}); }
      catch (error) {
        if (!isTemporaryLicenseFailure(error) || !claims) throw error;
        // The signed, unexpired receipt supports bounded local work during a
        // transient service outage. A real 401/403 denial never falls back.
        result = {view:{canWrite:true},receipt:null};
      }
      if (auth.currentUser?.uid !== uid || sessionStorage.getItem("bankSetuTenantId") !== tenantId) throw new Error("The signed-in workspace changed.");
      if (!result.view.canWrite) throw new Error("Your Bank Setu license is pending or expired. Please renew or activate your license to continue.");
      if (result.receipt) {
        claims = await verifyLicenseReceipt(result.receipt, uid, tenantId);
        try { saveLicenseReceipt(result.receipt, uid, tenantId); }
        catch { /* The current verified online request remains valid; offline access will need a fresh saved receipt. */ }
      } else if (!claims) throw new Error("Connect to the internet to verify your Bank Setu license.");
    }
    if (!claims || !["active", "expiring_soon", "demo_active"].includes(claims.state)) throw new Error("Connect to the internet to verify your Bank Setu license.");
    if (auth.currentUser?.uid !== uid || sessionStorage.getItem("bankSetuTenantId") !== tenantId || sessionStorage.getItem("bankSetuLicenseRequired") !== "true") throw new Error("The signed-in workspace changed.");
  })();
  verification = task;
  try { await task; } finally { if (verification === task) verification = undefined; }
}
