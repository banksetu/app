import trustedKey from '../generated/licensePublicKey.json';
export type LicenseReceipt={payload:string;signature:string};
export type LicenseClaims={purpose:'banksetu-license-v1';uid:string;tenantId:string;revision:number;state:string;issuedAt:number;validUntil:number;expiresAt:string|null;plan:'annual'|'lifetime'|'demo'};
const keyName=(uid:string,tenantId:string)=>`bankSetuLicenseReceipt:${uid}:${tenantId}`;
const trusted=trustedKey as JsonWebKey;
const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyLicenseReceipt(receipt:LicenseReceipt,uid:string,tenantId:string,now=Date.now(),lastTrusted=0,minimumRevision=0):Promise<LicenseClaims>{
  return verifyLicenseReceiptWithKey(receipt,trusted,uid,tenantId,now,lastTrusted,minimumRevision);
}
export async function verifyLicenseReceiptWithKey(receipt:LicenseReceipt,keyJwk:JsonWebKey,uid:string,tenantId:string,now=Date.now(),lastTrusted=0,minimumRevision=0):Promise<LicenseClaims>{
  if(keyJwk.kty!=='RSA'||!keyJwk.n||!keyJwk.e||keyJwk.d)throw new Error('Trusted license verification key is unavailable. Update Bank Setu.');
  if(!receipt||typeof receipt.payload!=='string'||receipt.payload.length>4096||typeof receipt.signature!=='string'||receipt.signature.length>1024)throw new Error('License receipt is invalid.');
  const key=await crypto.subtle.importKey('jwk',keyJwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(receipt.signature),new TextEncoder().encode(receipt.payload));
  if(!valid)throw new Error('License receipt signature is invalid.');
  const claims=JSON.parse(receipt.payload) as LicenseClaims;
  if(claims.purpose!=='banksetu-license-v1'||claims.uid!==uid||claims.tenantId!==tenantId||(!Number.isInteger(claims.revision)||claims.revision<minimumRevision||claims.revision<0)||!['annual','lifetime','demo'].includes(claims.plan)||!(claims.plan==='demo'?claims.state==='demo_active':['active','expiring_soon'].includes(claims.state))||!Number.isFinite(claims.issuedAt)||!Number.isFinite(claims.validUntil)||claims.validUntil<=claims.issuedAt||claims.validUntil-claims.issuedAt>5*86400000||claims.issuedAt>now+300000||now<lastTrusted-300000||now>=claims.validUntil||(['annual','demo'].includes(claims.plan)&&(!claims.expiresAt||!Number.isFinite(Date.parse(claims.expiresAt))||now>=Date.parse(claims.expiresAt)||claims.validUntil>Date.parse(claims.expiresAt))))throw new Error('License verification expired. Reconnect to verify your license.');
  return claims;
}
export function saveLicenseReceipt(receipt:LicenseReceipt,uid:string,tenantId:string,at=Date.now()):void{
  localStorage.setItem(keyName(uid,tenantId),JSON.stringify({receipt,lastTrusted:at}));
  localStorage.removeItem(keyName(uid,tenantId)+':invalid');
}
export async function cachedLicenseReceipt(uid:string,tenantId:string):Promise<LicenseClaims>{
  let stored:{receipt:LicenseReceipt;lastTrusted:number};
  try{stored=JSON.parse(localStorage.getItem(keyName(uid,tenantId))||'');}
  catch{throw new Error('Connect once to verify this device and license.');}
  const now=Date.now();const claims=await verifyLicenseReceipt(stored.receipt,uid,tenantId,now,stored.lastTrusted);
  const authorization=await cachedLicenseAuthorization(uid,tenantId);
  if(authorization && (!authorization.canWrite||authorization.revision!==claims.revision))throw new Error('License authorization was superseded.');
  if(localStorage.getItem(keyName(uid,tenantId)+':invalid')==='true')throw new Error('Reconnect to renew revoked authorization.');
  if(now>stored.lastTrusted)saveLicenseReceipt(stored.receipt,uid,tenantId,now);
  return claims;
}

export type LicenseAuthorization={purpose:'banksetu-license-status-v1';uid:string;tenantId:string;revision:number;state:string;canWrite:boolean;plan:string|null;expiresAt:string|null;issuedAt:number;validUntil:number};
export async function verifyLicenseAuthorization(signed:LicenseReceipt,uid:string,tenantId:string,now=Date.now()):Promise<LicenseAuthorization>{
  if(!signed||typeof signed.payload!=='string'||signed.payload.length>4096||typeof signed.signature!=='string'||signed.signature.length>1024)throw Error('Invalid license authorization.');
  const key=await crypto.subtle.importKey('jwk',trusted,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(signed.signature),new TextEncoder().encode(signed.payload)))throw Error('Invalid authorization signature.');
  const value=JSON.parse(signed.payload) as LicenseAuthorization;
  if(value.purpose!=='banksetu-license-status-v1'||value.uid!==uid||value.tenantId!==tenantId||!Number.isInteger(value.revision)||value.revision<0||!Number.isFinite(value.issuedAt)||!Number.isFinite(value.validUntil)||value.issuedAt>now+300000||value.validUntil<=now||value.validUntil<=value.issuedAt||value.validUntil-value.issuedAt>5*86400000||typeof value.canWrite!=='boolean'||value.canWrite!==['active','expiring_soon','demo_active'].includes(value.state)||!['active','expiring_soon','demo_active','demo_expired','scheduled','pending','expired','suspended','revoked'].includes(value.state))throw Error('Invalid or expired license authorization.');
  return value;
}
export function invalidateLicenseReceipt(uid:string,tenantId:string){
  if(uid&&tenantId)try{localStorage.setItem(keyName(uid,tenantId)+':invalid','true');}catch{/* In-memory permission remains denied. */}
}
async function cachedLicenseAuthorization(uid:string,tenantId:string){
  const stored=localStorage.getItem(keyName(uid,tenantId)+':authorization');
  return stored?verifyLicenseAuthorization(JSON.parse(stored),uid,tenantId):null;
}
export async function saveLicenseAuthorization(signed:LicenseReceipt,uid:string,tenantId:string){
  const next=await verifyLicenseAuthorization(signed,uid,tenantId);
  // Even an expired prior authorization establishes a revision floor.
  const raw=localStorage.getItem(keyName(uid,tenantId)+':authorization');
  if(raw){
    const priorSigned=JSON.parse(raw);const prior=JSON.parse(priorSigned.payload);
    await verifyLicenseAuthorization(priorSigned,uid,tenantId,Math.max(prior.issuedAt,Math.min(Date.now(),prior.validUntil-1)));
    if(next.revision<prior.revision||next.revision===prior.revision&&next.issuedAt<prior.issuedAt)throw Error('License authorization revision is stale.');
  }
  localStorage.setItem(keyName(uid,tenantId)+':authorization',JSON.stringify(signed));
  if(!next.canWrite)invalidateLicenseReceipt(uid,tenantId);
}
