import { auth } from "../firebase";
import { callBankSetuWorker } from "../workerApi";
import { customerRepository } from "./customerRepository";
import { setTenantApiUrl, setTenantWorkspaceReady } from "../tenantApi";
export type OfflineClaims = {
  uid: string; tenantId: string; role: "client_admin" | "client_user";
  status: "approved"; subscriptionStatus: "active";
  connectionId: string; apiUrl: string; issuedAt: number; expiresAt: number;
};
export type SignedSession = {payload: string; signature: string; publicKey: JsonWebKey};
const scope = (uid: string) => `offline:${uid}`;
export async function verifyOfflineSession(session: SignedSession, uid: string, now = Date.now()): Promise<OfflineClaims> {
  if (!session || typeof session.payload !== "string" || session.payload.length>20000 || typeof session.signature!=="string") throw new Error("Offline permission is invalid.");
  if (session.publicKey.kty!=="RSA" || session.publicKey.d) throw new Error("Invalid offline verification key.");
  const key=await crypto.subtle.importKey("jwk",session.publicKey,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const binary=atob(session.signature.replace(/-/g,"+").replace(/_/g,"/"));
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,Uint8Array.from(binary,c=>c.charCodeAt(0)),new TextEncoder().encode(session.payload));
  if(!valid)throw new Error("Offline permission signature is invalid.");
  const claims=JSON.parse(session.payload) as OfflineClaims;
  if(claims.uid!==uid || !claims.tenantId || !claims.connectionId || !["client_admin","client_user"].includes(claims.role) || claims.status!=="approved" || claims.subscriptionStatus!=="active" || !Number.isFinite(claims.expiresAt) || !Number.isFinite(claims.issuedAt) || claims.issuedAt>now+300000 || claims.expiresAt<=now || claims.expiresAt-claims.issuedAt>8*60*60*1000 || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(claims.apiUrl)) throw new Error("Offline access expired or belongs to another account. Connect to the internet; local records are retained.");
  return claims;
}
export async function enrollOfflineSession(): Promise<void> {
  const uid=auth.currentUser?.uid;if(!uid)return;
  const session=await callBankSetuWorker<SignedSession>("/get-offline-session",{});
  const claims=await verifyOfflineSession(session,uid);
  if(auth.currentUser?.uid!==uid)return;
  await customerRepository.transact(scope(uid),state=>{state.offlineSession=session;});
  sessionStorage.setItem("bankSetuOfflineUntil",String(claims.expiresAt));
}
export async function resumeOfflineSession(uid: string): Promise<OfflineClaims> {
  const state=await customerRepository.read(scope(uid));
  if(!state.offlineSession)throw new Error("First login must be online. No verified offline session is saved on this device.");
  const claims=await verifyOfflineSession(state.offlineSession,uid);
  sessionStorage.setItem("bankSetuTenantId",claims.tenantId);sessionStorage.setItem("bankSetuAccountRole",claims.role);sessionStorage.setItem("bankSetuRole",claims.role==="client_admin"?"admin":"user");
  sessionStorage.setItem("bankSetuConnectionMode","option-b");sessionStorage.setItem("bankSetuConnectionId",claims.connectionId);sessionStorage.setItem("bankSetuBridgeUrl",claims.apiUrl);sessionStorage.setItem("bankSetuOfflineUntil",String(claims.expiresAt));
  setTenantApiUrl(claims.apiUrl);setTenantWorkspaceReady(true);return claims;
}
export async function clearOfflineSession(uid: string) {
  await customerRepository.transact(scope(uid),state=>{delete state.offlineSession;});
}
