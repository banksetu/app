import { getAuth } from "firebase/auth";

/** Keep browser-cached operational configuration inside the signed-in tenant. */
export function tenantStorageKey(baseKey: string): string {
  const tenantId = sessionStorage.getItem("bankSetuTenantId")?.trim();
  if (tenantId) return `${baseKey}:tenant:${tenantId}`;

  const uid = getAuth().currentUser?.uid;
  return `${baseKey}:user:${uid || "unassigned"}`;
}

export function getTenantApiUrl(): string {
  const role = sessionStorage.getItem("bankSetuAccountRole")?.trim().toLowerCase();
  if (["client_admin", "client_user"].includes(role || "") && sessionStorage.getItem("bankSetuWorkspaceReady") !== "true") {
    return "";
  }
  return localStorage.getItem(tenantStorageKey("bankSetuApiUrl"))?.trim() || "";
}

/** Customer search uses the bridge bound to this verified workspace session.
 * The tenant-scoped localStorage URL can lag behind a bridge reconnection. */
export function getCustomerSearchApiUrl(localMode: boolean): string {
  if (localMode) return sessionStorage.getItem("bankSetuWorkspaceReady") === "true"
    ? sessionStorage.getItem("bankSetuBridgeUrl")?.trim() || "" : "";
  return getTenantApiUrl();
}

export function setTenantApiUrl(value: string): void {
  localStorage.setItem(tenantStorageKey("bankSetuApiUrl"), value.trim());
}

export function setTenantWorkspaceReady(ready: boolean): void {
  if (ready) sessionStorage.setItem("bankSetuWorkspaceReady", "true");
  else sessionStorage.removeItem("bankSetuWorkspaceReady");
  window.dispatchEvent(new Event("banksetu-workspace-change"));
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
