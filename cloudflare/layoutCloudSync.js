import {normalizedBankKey} from "./layoutTemplates.js";

/** Compact, per-tenant recovery over existing Cloudflare/Firebase service.
 * NEVER sends scanned PDFs/AI models, customer data, credentials or images.
 * Worker sanitizes generic design before invoking these helpers.
 */
const SLOT=/^layout-[1-9][0-9]{0,2}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const MODES=new Set(["passbook","accountOpening"]);
const MAX_SLOTS=32,MAX_GZIP=95*1024,MAX_PLAIN=165*1024;
export function validCloudSlot(slot){
  if(typeof slot!=="string"||!SLOT.test(slot))throw Error("Choose a valid layout slot.");
  return slot;
}
export function layoutManifestId(tenantId,bankKey,mode){
  if(typeof tenantId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)||
     typeof bankKey!=="string"||!/^[a-z0-9-]{1,120}$/.test(bankKey)||
     !MODES.has(mode))throw Error("Invalid verified tenant, bank or layout mode.");
  return tenantId.length+"-"+tenantId+"-"+bankKey.length+"-"+bankKey+"-"+mode;
}
export function layoutCloudPaths(tenantId,bankKey,mode,slotId){
  const id=layoutManifestId(tenantId,bankKey,mode);
  return {manifest:"/tenantLayoutManifests/"+id,
    slot:slotId?"/tenantLayoutBackups/"+id+"--"+validCloudSlot(slotId):""};
}
export function safeCloudManifest(raw,tenantId,bankKey,mode){
  if(!raw||raw.tenantId!==tenantId||raw.bankKey!==bankKey||raw.mode!==mode||
     !Number.isSafeInteger(raw.revision)||raw.revision<0||!Array.isArray(raw.slots))
     throw Error("Cloud layout manifest is corrupt or belongs to another workspace.");
  if(raw.slots.length>MAX_SLOTS)throw Error("Cloud layout manifest is too large.");
  const seen=new Set();
  const slots=raw.slots.map(row=>{
    if(!row||!SLOT.test(row.slotId)||seen.has(row.slotId)||
       !Number.isSafeInteger(row.revision)||row.revision<1||!DIGEST.test(row.hash)||
       !Number.isSafeInteger(row.size)||row.size<1||row.size>MAX_GZIP)
      throw Error("Invalid or duplicate cloud layout slot manifest.");
    seen.add(row.slotId);
    return {slotId:row.slotId,revision:row.revision,hash:row.hash,
      size:row.size,updatedAt:String(row.updatedAt||"").slice(0,32)};
  });
  return {tenantId,bankKey,mode,revision:raw.revision,slots};
}
export function changedLayoutSlots(manifest,known={}){
  if(!known||typeof known!=="object"||Array.isArray(known))known={};
  return manifest.slots.filter(slot=>known[slot.slotId]!==slot.hash);
}
export function nextCloudManifest(old,entry,now,expectedRevision){
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||
     old.revision!==expectedRevision)throw Error("Cloud template revision changed. Refresh before saving.");
  validCloudSlot(entry.slotId);
  if(!DIGEST.test(entry.hash)||!Number.isSafeInteger(entry.size)||entry.size<1||entry.size>MAX_GZIP)
    throw Error("Invalid compressed template manifest entry.");
  const others=old.slots.filter(item=>item.slotId!==entry.slotId);
  if(others.length>=MAX_SLOTS)throw Error("Cloud template limit reached; keep old designs offline.");
  const previous=old.slots.find(item=>item.slotId===entry.slotId);
  const next={...entry,revision:(previous?.revision||0)+1,updatedAt:now};
  return {...old,revision:old.revision+1,slots:[...others,next]
    .sort((a,b)=>Number(a.slotId.slice(7))-Number(b.slotId.slice(7)))};
}
const toHex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
const decodeBase64=encoded=>{
  if(typeof encoded!=="string"||encoded.length>MAX_GZIP*1.45||!/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded))
    throw Error("Invalid layout cloud backup encoding.");
  const raw=atob(encoded),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
};
export async function compactLayoutTemplate(template){
  const text=JSON.stringify(template),bytes=new TextEncoder().encode(text);
  if(bytes.byteLength>MAX_PLAIN)throw Error("The generic layout exceeds the compact cloud quota.");
  const hashed=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  const compressed=new Uint8Array(await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))
  ).arrayBuffer());
  if(compressed.length>MAX_GZIP)throw Error("Layout compressed cloud backup exceeds quota.");
  let binary="";
  for(let i=0;i<compressed.length;i+=8192)
    binary+=String.fromCharCode(...compressed.subarray(i,i+8192));
  return {encoding:"gzip-base64",payload:btoa(binary),hash:toHex(hashed),size:compressed.length};
}
export async function inflateLayoutTemplate(snapshot){
  if(!snapshot||snapshot.encoding!=="gzip-base64"||!DIGEST.test(snapshot.hash))
    throw Error("Unsupported or corrupt layout cloud backup.");
  const compressed=decodeBase64(snapshot.payload);
  if(compressed.length>MAX_GZIP||compressed.length!==snapshot.size)
    throw Error("Layout backup size mismatch.");
  const bytes=new Uint8Array(await new Response(
    new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))
  ).arrayBuffer());
  if(bytes.length>MAX_PLAIN)throw Error("Layout backup expands beyond allowed size.");
  const hash=toHex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));
  if(hash!==snapshot.hash)throw Error("Layout backup checksum mismatch.");
  const parsed=JSON.parse(new TextDecoder().decode(bytes));
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
    throw Error("Invalid cloud layout backup structure.");
  return parsed;
}
export function normalizedCloudBank(name){return normalizedBankKey(name);}
