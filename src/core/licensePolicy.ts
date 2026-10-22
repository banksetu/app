/** Client entitlements are tenant scoped. Profile rollout flags never grant access. */
export function requiresTenantLicense(profile: { role?: string; tenantId?: string; licenseRequired?: boolean }): boolean {
  return Boolean(profile.tenantId) || !["master_owner", "admin"].includes(String(profile.role || "").toLowerCase());
}
export const writableLicenseStates = ["active", "expiring_soon", "demo_active"];
export const readOnlyPages = ["dashboard", "customers", "all-customer-data", "settings", "license-management", "sync-backup", "support"];
export function canOpenLicensePage(page: string, readOnly: boolean, demoExpired: boolean): boolean {
  return demoExpired ? ["license-management", "support", "sync-backup"].includes(page) : !readOnly || readOnlyPages.includes(page);
}
export type LicensePermission = {
  uid: string; tenantId: string; state: string; canWrite: boolean; revision: number;
  plan: string | null; expiresAt: string | null; validUntil: number; daysRemaining: number | null; warning: string;
};
