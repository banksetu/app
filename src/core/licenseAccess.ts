import { auth } from "../firebase";
import { callBankSetuWorker } from "../workerApi";
import { cachedLicenseReceipt, saveLicenseReceipt, verifyLicenseReceipt, verifyLicenseAuthorization, saveLicenseAuthorization, invalidateLicenseReceipt, type LicenseReceipt } from "./licenseReceipt";
import { requiresTenantLicense, type LicensePermission } from "./licensePolicy";

const blockedMessage = "Your Bank Setu license is pending, expired, suspended or revoked. Renew or activate your license to continue.";
let permission: LicensePermission = {uid:"",tenantId:"",state:"checking",canWrite:false,revision:0,plan:null,expiresAt:null,validUntil:0,daysRemaining:null,warning:blockedMessage};
let generation=0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const listeners=new Set<()=>void>();
export const getLicensePermission=()=>permission;
export const subscribeLicensePermission=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
function publish(next:LicensePermission) {
  clearTimeout(expiryTimer);permission=next;
  if(typeof document!=="undefined")document.body?.setAttribute("data-banksetu-license-write",String(next.canWrite));
  sessionStorage.setItem("bankSetuLicenseReadOnly",String(!next.canWrite));
  sessionStorage.setItem("bankSetuDemoWorkspace",next.plan==="demo"?(next.canWrite?"active":"expired"):"false");
  listeners.forEach(listener=>listener());
  if(next.canWrite && Number.isFinite(next.validUntil))expiryTimer=setTimeout(()=>{
    if(permission===next)denyLicense("expired",blockedMessage);
  },Math.max(0,Math.min(2147483647,next.validUntil-Date.now())));
}
export function resetLicensePermission() {
  generation++;publish({uid:"",tenantId:"",state:"checking",canWrite:false,revision:0,plan:null,expiresAt:null,validUntil:0,daysRemaining:null,warning:blockedMessage});
  void window.bankSetuDesktop?.licenseSession("").catch(()=>{});
}
export function bindLicenseAccount(uid:string,profile:{role?:string;tenantId?:string;licenseRequired?:boolean}) {
  const tenantId=String(profile.tenantId||"").trim();
  const required=requiresTenantLicense(profile);
  sessionStorage.setItem("bankSetuLicenseRequired",String(required));
  if(permission.uid!==uid||permission.tenantId!==tenantId){
    generation++;publish({uid,tenantId,state:"checking",canWrite:false,revision:0,plan:null,expiresAt:null,validUntil:0,daysRemaining:null,warning:blockedMessage});
    void window.bankSetuDesktop?.licenseSession(uid).catch(()=>{});
  }
  if(!required)publish({...permission,state:"master",canWrite:true,validUntil:Infinity,warning:""});
}
export function denyLicense(state="unverified",warning=blockedMessage) {
  generation++;
  invalidateLicenseReceipt(permission.uid,permission.tenantId);
  void window.bankSetuDesktop?.licenseSession(permission.uid).catch(()=>{});
  publish({...permission,state,canWrite:false,warning});
}
export const isTemporaryLicenseFailure=(error:unknown):boolean=>{
  const status=(error as {status?:number})?.status;
  return status===429||(typeof status==="number"&&status>=500)||error instanceof TypeError||
    (error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError"));
};
let request: {key:string;task:Promise<void>} | undefined;
/** Online status is always authoritative; an offline receipt cannot override a denial. */
export async function refreshLicensePermission(online=navigator.onLine):Promise<void> {
  const {uid,tenantId}=permission;
  if(permission.state==="master")return;
  if(!uid||!tenantId){denyLicense();return;}
  const epoch=generation,key=`${epoch}:${uid}:${tenantId}:${online}`;
  if(request?.key===key)return request.task;
  const current=()=>generation===epoch&&auth.currentUser?.uid===uid&&permission.tenantId===tenantId;
  const task=(async()=>{
    if(online){
      try {
        const result=await callBankSetuWorker<{view:{canWrite:boolean;state:string;daysRemaining:number|null};receipt:LicenseReceipt|null;authorization:LicenseReceipt}>("/license-me",{});
        if(!current())return;
        const status=await verifyLicenseAuthorization(result.authorization,uid,tenantId);
        if(!current())return;
        if(status.state!==result.view.state||status.canWrite!==result.view.canWrite)throw Error("License response does not match its signed authorization.");
        await saveLicenseAuthorization(result.authorization,uid,tenantId);
        if(!current())return;
        await window.bankSetuDesktop?.licenseStatus(result.authorization);
        if(!current())return;
        if(!status.canWrite){publish({...permission,...status,daysRemaining:result.view.daysRemaining,warning:blockedMessage});return;}
        if(!result.receipt)throw Error("License receipt is missing.");
        const claims=await verifyLicenseReceipt(result.receipt,uid,tenantId,Date.now(),0,status.revision);
        if(claims.state!==status.state||claims.plan!==status.plan)throw Error("License receipt does not match its authorization.");
        if(!current())return;
        saveLicenseReceipt(result.receipt,uid,tenantId);
        await window.bankSetuDesktop?.licenseReceipt(result.receipt);
        if(current())publish({...permission,...claims,canWrite:true,daysRemaining:result.view.daysRemaining,warning:""});
        return;
      } catch(error) {
        if(!current())return;
        if(!isTemporaryLicenseFailure(error)){denyLicense("unverified",error instanceof Error?error.message:blockedMessage);return;}
      }
    }
    try {
      const claims=await cachedLicenseReceipt(uid,tenantId);
      if(!current())return;
      const saved=JSON.parse(localStorage.getItem(`bankSetuLicenseReceipt:${uid}:${tenantId}`)||"null");
      if(saved?.receipt)await window.bankSetuDesktop?.licenseReceipt(saved.receipt);
      if(current())publish({...permission,...claims,canWrite:true,daysRemaining:claims.expiresAt?Math.max(0,Math.ceil((Date.parse(claims.expiresAt)-Date.now())/86400000)):null,warning:""});
    } catch {
      if(current())publish({...permission,state:permission.plan==="demo"?"demo_expired":"unverified",canWrite:false,warning:"Connect to verify your license. Existing records and backup remain accessible."});
    }
  })();
  request={key,task};try{await task;}finally{if(request?.task===task)request=undefined;}
}
/** Shared gate for local mutations, PDF generation and printing on every platform. */
export async function requireLicensedWrite():Promise<void> {
  const uid=auth.currentUser?.uid,tenantId=sessionStorage.getItem("bankSetuTenantId")||"";
  if(!uid||permission.uid!==uid||permission.tenantId!==tenantId)throw Error("Verify your account and license before changing customer data.");
  const epoch=generation;
  await refreshLicensePermission(navigator.onLine);
  if(!permission.canWrite||permission.validUntil<=Date.now())throw Error(blockedMessage);
  const demo=sessionStorage.getItem("bankSetuConnectionMode")==="demo";
  if(permission.plan==="demo"?!demo:demo)throw Error("Reconnect to the separate licensed workspace before changing data.");
  if(generation!==epoch||auth.currentUser?.uid!==uid||permission.tenantId!==tenantId)throw Error("The signed-in workspace changed.");
}
