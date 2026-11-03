import {callBankSetuWorker} from "./workerApi";
import {customerRepository} from "./core/customerRepository";
import {currentLayoutScope} from "./layoutLocalStore";
import {layoutSlotKey,listLayoutSlots,
 mergeRemoteLayoutSlot,markLayoutSynced,type LayoutMode} from "./layoutLocalState.ts";
import {validatePersistedLayoutDraft} from "./layoutDraftValidation";
import {makeGenericLayoutUpload} from "./layoutGenericUpload.ts";

/** Existing Worker is the ONLY cloud transport. Local DB is the ONLY local
 * persistence engine. No separate sync loop, Firebase client credentials,
 * source PDF uploads or direct Firestore access.
 */
type IndexEntry={slotId:string;revision:number;hash:string;size:number;updatedAt:string};
type SyncIndex={success:true;tenantId:string;bankKey:string;mode:LayoutMode;
 revision:number;slots:IndexEntry[];changed:IndexEntry[]};
type CloudReply={success:true;slotId:string;bankName:string;mode:LayoutMode;
 revision:number;hash:string;size:number;encoding:string;payload:string};
const HEX=/^[a-f0-9]{64}$/;
function verifyScope(scope:string,tenantId:string,uid:string){
  const active=currentLayoutScope();
  if(active.scope!==scope||active.tenantId!==tenantId||active.uid!==uid)
    throw Error("Client workspace changed; the other tenant's layout was not loaded.");
}
export async function decodeLayoutBackup(reply:CloudReply):Promise<Record<string,unknown>>{
  if(reply.encoding!=="gzip-base64"||!HEX.test(reply.hash)||
     !Number.isSafeInteger(reply.size)||reply.size<1||reply.size>95*1024||
     typeof reply.payload!=="string"||reply.payload.length>130*1024)
    throw Error("Invalid compact template backup.");
  const binary=atob(reply.payload);
  if(binary.length!==reply.size)throw Error("Cloud layout byte count mismatch.");
  const compressed=Uint8Array.from(binary,char=>char.charCodeAt(0));
  const unpacked=new Uint8Array(await new Response(
    new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))
  ).arrayBuffer());
  if(unpacked.length>165*1024)throw Error("Cloud layout backup expanded beyond quota.");
  const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",unpacked))]
    .map(x=>x.toString(16).padStart(2,"0")).join("");
  if(hash!==reply.hash)throw Error("Cloud layout backup failed integrity verification.");
  const result:unknown=JSON.parse(new TextDecoder().decode(unpacked));
  if(!result||typeof result!=="object"||Array.isArray(result))
    throw Error("Invalid downloaded layout structure.");
  if(!validatePersistedLayoutDraft(result,reply.mode,reply.bankName))
    throw Error("Cloud layout was not a valid same-bank editable draft.");
  return result as Record<string,unknown>;
}

async function indexFor(bankName:string,mode:LayoutMode,known:Record<string,string>={}){
  const result=await callBankSetuWorker<SyncIndex>("/layout-sync-index",{
    mode,bankName,known
  });
  if(!result.success||result.mode!==mode||!Array.isArray(result.slots)||
      !Array.isArray(result.changed)||result.slots.length>32||
      result.changed.length>32||!Number.isSafeInteger(result.revision))
    throw Error("Invalid layout cloud index.");
  return result;
}
export type LayoutDownloadSummary={downloaded:number;unchanged:number;conflicts:number;offline:boolean};
export async function synchronizeLocalLayoutSlots(
  bankName:string,mode:LayoutMode,
):Promise<LayoutDownloadSummary>{
  const {scope,tenantId,uid}=currentLayoutScope();
  if(!navigator.onLine)return {downloaded:0,unchanged:0,conflicts:0,offline:true};
  const existing=listLayoutSlots(await customerRepository.read(scope),tenantId,bankName,mode);
  const known=Object.fromEntries(existing.filter(item=>HEX.test(item.remoteHash))
    .map(item=>[item.slotId,item.remoteHash]));
  const index=await indexFor(bankName,mode,known);
  if(index.tenantId!==tenantId)throw Error("Cloud index belongs to another workspace.");
  let downloaded=0,unchanged=index.slots.length-index.changed.length,conflicts=0;
  for(const entry of index.changed){
    verifyScope(scope,tenantId,uid);
    const reply=await callBankSetuWorker<CloudReply>("/layout-sync-download",{
      bankName,mode,slotId:entry.slotId
    });
    if(!reply.success||reply.slotId!==entry.slotId||reply.mode!==mode||
       reply.hash!==entry.hash||reply.revision!==entry.revision||
       reply.size!==entry.size||reply.bankName.trim().toLowerCase()!==bankName.trim().toLowerCase())
       throw Error("Downloaded layout differs from the authorized cloud index.");
    const draft=await decodeLayoutBackup(reply);
    verifyScope(scope,tenantId,uid);
    let outcome:"unchanged"|"downloaded"|"conflict"="unchanged";
    await customerRepository.transact(scope,state=>{
      outcome=mergeRemoteLayoutSlot(state,tenantId,bankName,mode,entry.slotId,{
        draft,revision:entry.revision,hash:entry.hash
      });
    });
    if(outcome==="downloaded")downloaded++;
    else if(outcome==="conflict")conflicts++;
    else unchanged++;
  }
  return {downloaded,unchanged,conflicts,offline:false};
}
export async function publishLocalLayoutSlot(
  bankName:string,mode:LayoutMode,slotId:string,
):Promise<{synced:boolean;revision:number;hash:string}>{
  const {scope,tenantId,uid}=currentLayoutScope();
  if(!navigator.onLine)throw Error("Layout saved locally; online connection required for device recovery.");
  const key=layoutSlotKey(bankName,mode,slotId);
  const state=await customerRepository.read(scope);
  const local=listLayoutSlots(state,tenantId,bankName,mode).find(item=>item.slotId===slotId);
  if(!local)throw Error("Save your layout to the local template repository first.");
  if(local.incoming)throw Error("Other device's layout differs; review the conflict before uploading.");
  const index=await indexFor(bankName,mode);
  if(index.tenantId!==tenantId)throw Error("Cloud index tenant mismatch.");
  const remote=index.slots.find(item=>item.slotId===slotId);
  if(remote&&remote.hash!==local.remoteHash){
    await synchronizeLocalLayoutSlots(bankName,mode);
    throw Error("A layout changed on another device. Local design was preserved; review both versions.");
  }
  if(!local.dirty)return {synced:true,revision:local.remoteRevision,hash:local.remoteHash};
  const template=makeGenericLayoutUpload(local.draft);
  verifyScope(scope,tenantId,uid);
  const result=await callBankSetuWorker<{success:true;revision:number;hash:string}>(
    "/layout-sync-publish",{
      bankName,mode,slotId,template,
      expectedManifestRevision:index.revision,expectedSlotRevision:remote?.revision||0
    });
  if(!result.success||!Number.isSafeInteger(result.revision)||!HEX.test(result.hash))
    throw Error("Layout backup sync acknowledgement was invalid.");
  verifyScope(scope,tenantId,uid);
  let marked=false;
  await customerRepository.transact(scope,current=>{
    marked=markLayoutSynced(current,tenantId,bankName,mode,slotId,
      local.localRevision,result.revision,result.hash);
  });
  if(!marked)throw Error("The local layout changed while uploading. Cloud has the prior version; save the newest local edit again.");
  return {synced:true,revision:result.revision,hash:result.hash};
}
