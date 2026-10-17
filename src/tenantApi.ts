import { getAuth } from "firebase/auth";

/** Keep browser-cached operational configuration inside the signed-in tenant. */
export function tenantStorageKey(baseKey: string): string {
  const tenantId = sessionStorage.getItem("bankSetuTenantId")?.trim();
  if (tenantId) return `${baseKey}:tenant:${tenantId}`;

  const uid = getAuth().currentUser?.uid;
  return `${baseKey}:user:${uid || "unassigned"}`;
}

export function getTenantApiUrl(): string {
  return localStorage.getItem(tenantStorageKey("bankSetuApiUrl"))?.trim() || "";
}

export function setTenantApiUrl(value: string): void {
  localStorage.setItem(tenantStorageKey("bankSetuApiUrl"), value.trim());
}

export function removeTenantApiUrl(): void {
  localStorage.removeItem(tenantStorageKey("bankSetuApiUrl"));
}

export function tenantSettingsPath(uid: string): ["tenantSettings" | "appSettings", string] {
  const tenantId = sessionStorage.getItem("bankSetuTenantId")?.trim();
  return tenantId ? ["tenantSettings", tenantId] : ["appSettings", uid];
}

export function tenantSettingsWriteMetadata(uid: string): Record<string, string> {
  const [collectionName, documentId] = tenantSettingsPath(uid);
  return collectionName === "tenantSettings"
    ? { tenantId: documentId, updatedBy: uid }
    : {};
}
