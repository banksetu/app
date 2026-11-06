import type {LocalState} from "./core/schema";
import {validatePersistedLayoutDraft} from "./layoutDraftValidation.ts";

/** Reuse BANK SETU's existing Web/Android IndexedDB + Windows SQLite
 * workspace repository. This is a NAMESPACE within LocalState.documents,
 * never a second DB, sync queue, printer or licensing engine.
 */
export const LAYOUT_STORAGE_KEY="__bankSetuLayoutSlotsV1";
const MAX_LOCAL_SLOTS=32,MAX_TEMPLATE_BYTES=256*1024;
export type LayoutMode="passbook"|"accountOpening";
export type LocalLayoutSlot={
  slotId:string;bankName:string;mode:LayoutMode;draft:Record<string,unknown>;
  localRevision:number;remoteRevision:number;remoteHash:string;
  dirty:boolean;updatedAt:string;incoming?:{
    draft:Record<string,unknown>;remoteRevision:number;remoteHash:string
  };
};
export type LocalLayoutStorage={version:1;tenantId:string;slots:Record<string,LocalLayoutSlot>};
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const norm=(name:string)=>name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g," ");
export function validateLayoutSlotId(slotId:string){
  if(!/^layout-[1-9][0-9]{0,2}$/.test(slotId))throw Error("Invalid bank layout slot.");
  return slotId;
}
export function layoutSlotKey(bankName:string,mode:LayoutMode,slotId:string){
  validateLayoutSlotId(slotId);
  if(!["passbook","accountOpening"].includes(mode)||!norm(bankName)||bankName.length>120)
    throw Error("Select the correct bank and layout type.");
  return JSON.stringify([norm(bankName),mode,slotId]);
}
const bytes=(input:unknown)=>new TextEncoder().encode(JSON.stringify(input)).byteLength;
function validatedDraft(draft:unknown,mode:LayoutMode,bankName:string):Record<string,unknown>{
  if(!validatePersistedLayoutDraft(draft,mode,bankName))
    throw Error("This layout draft does not match the selected bank or has invalid geometry.");
  if(bytes(draft)>MAX_TEMPLATE_BYTES)
    throw Error("Layout exceeds the local storage limit. Remove embedded PDF pixels; keep the source scan separately.");
  const copy=structuredClone(draft) as Record<string,unknown>;
  // Source scans and customer pixels are never a part of reusable template slots.
  for(const part of copy.elements as Record<string,unknown>[]){
    if(typeof part.imageData==="string"&&part.imageData.trim())throw Error("Embedded scan/customer image cannot be stored inside a reusable layout.");
  }
  return copy;
}
export function getLayoutStorage(state:LocalState,tenantId:string):LocalLayoutStorage{
  if(!tenantId||tenantId.length>128)throw Error("Verified client scope is required.");
  const raw=state.documents?.[LAYOUT_STORAGE_KEY];
  if(raw===undefined)return {version:1,tenantId,slots:{}};
  if(!plain(raw)||raw.version!==1||raw.tenantId!==tenantId||!plain(raw.slots))
    throw Error("Local template workspace does not match this client. Original templates were retained.");
  if(Object.keys(raw.slots).length>MAX_LOCAL_SLOTS)throw Error("Too many local templates; no cached data was modified.");
  for(const [key,slot] of Object.entries(raw.slots)){
    if(!plain(slot)||typeof slot.bankName!=="string"||
       typeof slot.mode!=="string"||typeof slot.slotId!=="string"||
       key!==layoutSlotKey(slot.bankName,slot.mode as LayoutMode,slot.slotId)||
       typeof slot.localRevision!=="number"||!Number.isSafeInteger(slot.localRevision)||slot.localRevision<1||
       typeof slot.remoteRevision!=="number"||!Number.isSafeInteger(slot.remoteRevision)||slot.remoteRevision<0||
       typeof slot.dirty!=="boolean"||
       !validatePersistedLayoutDraft(slot.draft,slot.mode,slot.bankName))
       throw Error("A cached layout is corrupt; original local data was retained for recovery.");
  }
  return structuredClone(raw) as LocalLayoutStorage;
}
export function listLayoutSlots(state:LocalState,tenantId:string,bankName:string,mode:LayoutMode):LocalLayoutSlot[]{
  const store=getLayoutStorage(state,tenantId);
  return Object.values(store.slots).filter(slot=>
    norm(slot.bankName)===norm(bankName)&&slot.mode===mode)
    .sort((a,b)=>Number(a.slotId.split("-")[1])-Number(b.slotId.split("-")[1]));
}
export function putLayoutSlot(
  state:LocalState,tenantId:string,bankName:string,mode:LayoutMode,slotId:string,
  draft:unknown,expectedLocalRevision?:number,
):LocalLayoutSlot{
  const key=layoutSlotKey(bankName,mode,slotId);
  const store=getLayoutStorage(state,tenantId);
  const old=store.slots[key];
  if(old&&expectedLocalRevision!==undefined&&old.localRevision!==expectedLocalRevision)
    throw Error("Layout changed in another window. Reload it before saving.");
  if(!old&&expectedLocalRevision!==undefined&&expectedLocalRevision!==0)
    throw Error("Layout slot changed in another window.");
  if(!old&&Object.keys(store.slots).length>=MAX_LOCAL_SLOTS)
    throw Error("Local layout slot limit reached; export an old draft before adding new slots.");
  const copy=validatedDraft(draft,mode,bankName);
  const slot:LocalLayoutSlot={
    slotId,bankName,mode,draft:copy,localRevision:(old?.localRevision||0)+1,
    remoteRevision:old?.remoteRevision||0,remoteHash:old?.remoteHash||"",
    dirty:true,updatedAt:new Date().toISOString(),
    // Editing a local draft must NEVER discard another device's incoming
    // candidate. Step 5 will add the explicit conflict-resolution UI.
    ...(old?.incoming?{incoming:old.incoming}:{})
  };
  store.slots[key]=slot;
  state.documents={...state.documents,[LAYOUT_STORAGE_KEY]:store};
  return structuredClone(slot);
}
/** Cloud data is ALREADY sanitized by authenticated Worker. Never override
 * unpublished local edits when another device has changed the same slot.
 */
export function mergeRemoteLayoutSlot(
 state:LocalState,tenantId:string,bankName:string,mode:LayoutMode,slotId:string,
 remote:{draft:unknown;revision:number;hash:string},
):"unchanged"|"downloaded"|"conflict"{
  const key=layoutSlotKey(bankName,mode,slotId);
  if(!Number.isSafeInteger(remote.revision)||remote.revision<1||
     !/^[a-f0-9]{64}$/.test(remote.hash))throw Error("Invalid cloud revision or checksum.");
  const copy=validatedDraft(remote.draft,mode,bankName);
  const store=getLayoutStorage(state,tenantId);
  const old=store.slots[key];
  if(old?.remoteHash===remote.hash){
    if(old.dirty&&old.incoming)throw Error("Conflicting remote layout requires manual review.");
    return "unchanged";
  }
  if(old?.dirty){
    // Store the incoming candidate for explicit review; the local layout,
    // customer records, existing operations and old template are untouched.
    store.slots[key]={...old,incoming:{draft:copy,remoteRevision:remote.revision,remoteHash:remote.hash}};
    state.documents={...state.documents,[LAYOUT_STORAGE_KEY]:store};
    return "conflict";
  }
  if(!old&&Object.keys(store.slots).length>=MAX_LOCAL_SLOTS)
    throw Error("Local template capacity exceeded; no remote slot was overwritten.");
  store.slots[key]={
    slotId,bankName,mode,draft:copy,localRevision:(old?.localRevision||0)+1,
    remoteRevision:remote.revision,remoteHash:remote.hash,
    dirty:false,updatedAt:new Date().toISOString(),
  };
  state.documents={...state.documents,[LAYOUT_STORAGE_KEY]:store};
  return "downloaded";
}
export function markLayoutSynced(
 state:LocalState,tenantId:string,bankName:string,mode:LayoutMode,slotId:string,
 localRevision:number,remoteRevision:number,remoteHash:string,
):boolean{
  const key=layoutSlotKey(bankName,mode,slotId),store=getLayoutStorage(state,tenantId);
  const old=store.slots[key];
  if(!old||old.localRevision!==localRevision||old.incoming)return false;
  if(!Number.isSafeInteger(remoteRevision)||remoteRevision<1||!/^[a-f0-9]{64}$/.test(remoteHash))
    throw Error("Cloud acknowledgement was invalid.");
  store.slots[key]={...old,dirty:false,remoteRevision,remoteHash,incoming:undefined};
  state.documents={...state.documents,[LAYOUT_STORAGE_KEY]:store};
  return true;
}
