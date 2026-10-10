import trustedKey from '../generated/licensePublicKey.json';
export type LicenseReceipt={payload:string;signature:string};
export type LicenseClaims={purpose:'banksetu-license-v1';uid:string;tenantId:string;revision:number;state:string;issuedAt:number;validUntil:number;expiresAt:string|null;plan:'annual'|'lifetime'|'demo'};
const keyName=(uid:string,tenantId:string)=>`bankSetuLicenseReceipt:${uid}:${tenantId}`;
const trusted=trustedKey as JsonWebKey;
const decode=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyLicenseReceipt(receipt:LicenseReceipt,uid:string,tenantId:string,now=Date.now(),lastTrusted=0):Promise<LicenseClaims>{
  return verifyLicenseReceiptWithKey(receipt,trusted,uid,tenantId,now,lastTrusted);
}
export async function verifyLicenseReceiptWithKey(receipt:LicenseReceipt,keyJwk:JsonWebKey,uid:string,tenantId:string,now=Date.now(),lastTrusted=0):Promise<LicenseClaims>{
  if(keyJwk.kty!=='RSA'||!keyJwk.n||!keyJwk.e||keyJwk.d)throw new Error('Trusted license verification key is unavailable. Update Bank Setu.');
  if(!receipt||typeof receipt.payload!=='string'||receipt.payload.length>4096||typeof receipt.signature!=='string'||receipt.signature.length>1024)throw new Error('License receipt is invalid.');
  const key=await crypto.subtle.importKey('jwk',keyJwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(receipt.signature),new TextEncoder().encode(receipt.payload));
  if(!valid)throw new Error('License receipt signature is invalid.');
  const claims=JSON.parse(receipt.payload) as LicenseClaims;
  if(claims.purpose!=='banksetu-license-v1'||claims.uid!==uid||claims.tenantId!==tenantId||!Number.isInteger(claims.revision)||!['annual','lifetime','demo'].includes(claims.plan)||!(claims.plan==='demo'?claims.state==='demo_active':['active','expiring_soon'].includes(claims.state))||!Number.isFinite(claims.issuedAt)||!Number.isFinite(claims.validUntil)||claims.validUntil<=claims.issuedAt||claims.validUntil-claims.issuedAt>5*86400000||claims.issuedAt>now+300000||now<lastTrusted-300000||now>=claims.validUntil||(['annual','demo'].includes(claims.plan)&&(!claims.expiresAt||!Number.isFinite(Date.parse(claims.expiresAt))||now>=Date.parse(claims.expiresAt)||claims.validUntil>Date.parse(claims.expiresAt))))throw new Error('License verification expired. Reconnect to verify your license.');
  return claims;
}
export function saveLicenseReceipt(receipt:LicenseReceipt,uid:string,tenantId:string,at=Date.now()):void{
  localStorage.setItem(keyName(uid,tenantId),JSON.stringify({receipt,lastTrusted:at}));
}
export async function cachedLicenseReceipt(uid:string,tenantId:string):Promise<LicenseClaims>{
  let stored:{receipt:LicenseReceipt;lastTrusted:number};
  try{stored=JSON.parse(localStorage.getItem(keyName(uid,tenantId))||'');}
  catch{throw new Error('Connect once to verify this device and license.');}
  const now=Date.now();const claims=await verifyLicenseReceipt(stored.receipt,uid,tenantId,now,stored.lastTrusted);
  if(now>stored.lastTrusted)saveLicenseReceipt(stored.receipt,uid,tenantId,now);
  return claims;
}
