import { auth } from "../firebase";
import { callBankSetuWorker } from "../workerApi";
import { customerRepository } from "./customerRepository";
import { setTenantApiUrl, setTenantWorkspaceReady } from "../tenantApi";
import trustedKey from "../generated/licensePublicKey.json";
export type OfflineClaims = {
  uid: string; tenantId: string; role: "client_admin" | "client_user" | "master_owner" | "admin";
  status: "approved"; subscriptionStatus: "active"; licenseRequired?: boolean; demoOnly?: boolean;
  connectionId: string; apiUrl: string; issuedAt: number; expiresAt: number;
};
export type SignedSession = {payload: string; signature: string; publicKey: JsonWebKey};
const scope = (uid: string) => `offline:${uid}`;
export async function verifyOfflineSession(session: SignedSession, uid: string, now = Date.now()): Promise<OfflineClaims> {
  if (!session || typeof session.payload !== "string" || session.payload.length>20000 || typeof session.signature!=="string") throw new Error("Offline permission is invalid.");
  const pinned = trustedKey as JsonWebKey;
  if (pinned.kty!=="RSA" || !pinned.n || !pinned.e || pinned.d) throw new Error("Trusted offline verification key is unavailable. Update Bank Setu.");
  const key=await crypto.subtle.importKey("jwk",pinned,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const binary=atob(session.signature.replace(/-/g,"+").replace(/_/g,"/"));
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,Uint8Array.from(binary,c=>c.charCodeAt(0)),new TextEncoder().encode(session.payload));
  if(!valid)throw new Error("Offline permission signature is invalid.");
  const claims=JSON.parse(session.payload) as OfflineClaims;
  if(claims.uid!==uid || !claims.tenantId || !claims.connectionId || !["client_admin","client_user","master_owner","admin"].includes(claims.role) || claims.status!=="approved" || claims.subscriptionStatus!=="active" || !Number.isFinite(claims.expiresAt) || !Number.isFinite(claims.issuedAt) || claims.issuedAt>now+300000 || claims.expiresAt<=now || claims.expiresAt-claims.issuedAt>(claims.licenseRequired===true?5*86400000:8*3600000) || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(claims.apiUrl)) throw new Error("Offline access expired or belongs to another account. Connect to the internet; local records are retained.");
  if(["master_owner","admin"].includes(claims.role)&&claims.tenantId!==`master:${uid}`)throw new Error("Master offline scope is invalid.");
  if(["client_admin","client_user"].includes(claims.role)&&claims.tenantId.startsWith("master:"))throw new Error("Client offline scope is invalid.");
  if(claims.demoOnly===true&&(claims.licenseRequired!==true||claims.connectionId!=="demo-sample"||claims.apiUrl!=="https://script.google.com/macros/s/banksetu-demo-local/exec"))throw new Error("Demo offline scope is invalid.");
  return claims;
}
export async function enrollOfflineSession(): Promise<void> {
  const uid=auth.currentUser?.uid;if(!uid)return;
  const stored=await customerRepository.read(scope(uid));
  if(stored.offlineSession){
    try{
      const claims=await verifyOfflineSession(stored.offlineSession,uid);
      const currentTenant=sessionStorage.getItem("bankSetuMasterLocalEnabled")==="true"?`master:${uid}`:sessionStorage.getItem("bankSetuTenantId");
      if(claims.expiresAt-Date.now()>2*60*60*1000 && claims.connectionId===sessionStorage.getItem("bankSetuConnectionId") && claims.tenantId===currentTenant && claims.role===sessionStorage.getItem("bankSetuAccountRole")){
        sessionStorage.setItem("bankSetuOfflineUntil",String(claims.expiresAt));return;
      }
    }catch{/* An expired or changed grant is renewed online. */}
  }
  const session=await callBankSetuWorker<SignedSession>("/get-offline-session",{});
  const claims=await verifyOfflineSession(session,uid);
  if(auth.currentUser?.uid!==uid)return;
  await customerRepository.transact(scope(uid),state=>{state.offlineSession=session;});
  sessionStorage.setItem("bankSetuOfflineUntil",String(claims.expiresAt));
}
export async function resumeOfflineSession(uid: string, expected?: {role:string;tenantId:string;demoOnly?:boolean}): Promise<OfflineClaims> {
  const state=await customerRepository.read(scope(uid));
  if(!state.offlineSession)throw new Error("First login must be online. No verified offline session is saved on this device.");
  const claims=await verifyOfflineSession(state.offlineSession,uid);
  if(auth.currentUser?.uid!==uid)throw new Error("Session changed.");
  if(expected&&(claims.role!==expected.role||(!["master_owner","admin"].includes(expected.role)&&claims.tenantId!==expected.tenantId)||(expected.demoOnly!==undefined&&Boolean(claims.demoOnly)!==expected.demoOnly)))throw new Error("Offline workspace no longer matches your account.");
  const master=["master_owner","admin"].includes(claims.role);
  if(master){if(claims.tenantId!==`master:${uid}`)throw new Error("Master offline scope is invalid.");sessionStorage.removeItem("bankSetuTenantId");sessionStorage.setItem("bankSetuMasterLocalEnabled","true");}else{sessionStorage.removeItem("bankSetuMasterLocalEnabled");sessionStorage.setItem("bankSetuTenantId",claims.tenantId);}
  sessionStorage.setItem("bankSetuAccountRole",claims.role);sessionStorage.setItem("bankSetuRole",claims.role!=="client_user"?"admin":"user");
  sessionStorage.setItem("bankSetuConnectionMode",master?"master-local":claims.demoOnly?"demo":"option-b");sessionStorage.setItem("bankSetuDemoWorkspace",claims.demoOnly?"active":"false");sessionStorage.setItem("bankSetuConnectionId",claims.connectionId);sessionStorage.setItem("bankSetuBridgeUrl",claims.apiUrl);sessionStorage.setItem("bankSetuOfflineUntil",String(claims.expiresAt));
  setTenantApiUrl(claims.apiUrl);setTenantWorkspaceReady(true);return claims;
}
export async function clearOfflineSession(uid: string) {
  await customerRepository.transact(scope(uid),state=>{delete state.offlineSession;});
}
