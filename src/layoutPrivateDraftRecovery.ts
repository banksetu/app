import {callBankSetuWorker} from "./workerApi";
import {currentLayoutScope} from "./layoutLocalStore";
import {layoutSlotKey,type LayoutMode} from "./layoutLocalState";
import {validatePersistedLayoutDraft} from "./layoutDraftValidation";

type PrivateReply={success:true;revision:number;bankName:string;mode:LayoutMode;slotId:string;draft:Record<string,unknown>|null};
function verifySession(scope:{scope:string;tenantId:string;uid:string}){
  const now=currentLayoutScope();
  if(now.scope!==scope.scope||now.uid!==scope.uid||now.tenantId!==scope.tenantId)
    throw Error("Your bank workspace changed during cloud recovery. Local data remains safe.");
}
function verify(bankName:string,mode:LayoutMode,slotId:string){
  layoutSlotKey(bankName,mode,slotId);
  if(!bankName||bankName.length>120)throw Error("Choose the verified bank.");
}
export async function readPrivateLayoutDraft(bankName:string,mode:LayoutMode,slotId:string){
  verify(bankName,mode,slotId);
  if(!navigator.onLine)throw Error("Cloud recovery needs an online connection. Offline drafts remain available.");
  const scope=currentLayoutScope();
  const result=await callBankSetuWorker<PrivateReply>("/layout-private-read",{bankName,mode,slotId});
  verifySession(scope);
  if(!result.success||result.mode!==mode||result.slotId!==slotId||
    result.bankName!==bankName||!Number.isSafeInteger(result.revision)||result.revision<0)
    throw Error("Private layout recovery belongs to a different workspace.");
  if(result.draft&&!validatePersistedLayoutDraft(result.draft,mode,bankName))
    throw Error("Cloud draft is not a valid editable layout for this bank.");
  if(result.revision===0&&result.draft!==null)throw Error("Inconsistent remote draft revision.");
  return {revision:result.revision,draft:result.draft};
}
export async function savePrivateLayoutDraft(
  bankName:string,mode:LayoutMode,slotId:string,draft:unknown,expectedRevision:number,
){
  verify(bankName,mode,slotId);
  if(!navigator.onLine)throw Error("Layout saved locally; cloud recovery is available when online.");
  if(!validatePersistedLayoutDraft(draft,mode,bankName))throw Error("Invalid local draft cannot be backed up.");
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error("Invalid cloud revision.");
  const scope=currentLayoutScope();
  const result=await callBankSetuWorker<{success:true;revision:number;hash:string}>(
    "/layout-private-save",{bankName,mode,slotId,draft,expectedRevision});
  verifySession(scope);
  if(!result.success||result.revision!==expectedRevision+1||!/^[a-f0-9]{64}$/.test(result.hash))
    throw Error("Private cloud backup acknowledgement was invalid.");
  return {revision:result.revision,hash:result.hash};
}
