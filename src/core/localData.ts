import { isAndroid, shareAndroidBackup } from "../platform/android/runtime";
import { makeBackup, parseBackup, mergeBackup } from "./backup";
import { auth } from "../firebase";
import { customerRepository as repository } from "./customerRepository";
import type { Customer, CachedRecord, QueueOperation } from "./schema";
export const networkFetch = globalThis.fetch.bind(globalThis);
const IDLE_RECONCILE_MS=60*60*1000;
export const localModeEnabled = () => sessionStorage.getItem("bankSetuConnectionMode")==="option-b" || (["master_owner","admin"].includes(sessionStorage.getItem("bankSetuAccountRole")||"") && sessionStorage.getItem("bankSetuMasterLocalEnabled")==="true");
const identity = () => {
  const uid = auth.currentUser?.uid;
  const tenant = sessionStorage.getItem("bankSetuMasterLocalEnabled")==="true" ? `master:${uid}` : sessionStorage.getItem("bankSetuTenantId");
  const connection = sessionStorage.getItem("bankSetuConnectionId");
  if (!uid || !tenant || !connection || sessionStorage.getItem("bankSetuWorkspaceReady") !== "true") throw new Error("An active, verified client connection is required.");
  if (!navigator.onLine && Date.now() > Number(sessionStorage.getItem("bankSetuOfflineUntil") || 0)) throw new Error("Offline access expired. Reconnect to verify account permissions; local records are retained.");
  // Include user UID: a second user on this device never inherits offline records.
  return `${uid}:${tenant}:${connection}`;
};
const resultResponse = (value: unknown) => new Response(JSON.stringify(value), {headers:{"content-type":"application/json"}});
function actionNotice(type: "success" | "error" | "progress" | "warning", title: string, message: string) {
  const event = new Event("banksetu-notification") as Event & {detail:{type:string;title:string;message:string}};
  event.detail = {type,title,message}; window.dispatchEvent(event);
}
const fold = (value: unknown) => String(value ?? "").trim().toLowerCase();
const supportedReads = new Set(["searchCustomer", "getCustomerByRowNumber", "getAllCustomers"]);
const supportedWrites = new Set(["saveCustomer", "updateCustomer", "deleteCustomer", "markPassbookDelivered", "markPassbookPrinted"]);
export async function localDataFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!localModeEnabled() || init?.method !== "POST" || typeof init.body !== "string") return networkFetch(input, init);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(init.body); } catch { return networkFetch(input, init); }
  const url = String(input);
  if (url !== sessionStorage.getItem("bankSetuBridgeUrl")) {
    if (!payload.idToken) throw new Error("Workspace bridge changed. Reconnect before accessing Google data.");
    return networkFetch(input, init);
  }
  if(sessionStorage.getItem("bankSetuMasterLocalEnabled")==="true"){payload.masterLocalSync=true;init={...init,body:JSON.stringify(payload)};}
  const action = String(payload.action || "");
  const scope = identity();
  const cloudRead=async(target: RequestInfo | URL, options?: RequestInit)=>{
    const user=auth.currentUser!;const idToken=await user.getIdToken();
    if(identity()!==scope)throw new Error("Workspace changed.");
    const body=JSON.parse(String(options?.body||"{}"));
    const response=await networkFetch(target,{...options,body:JSON.stringify({...body,idToken}),signal:AbortSignal.timeout(25000)});
    if(identity()!==scope)throw new Error("Workspace changed.");
    return response;
  };
  const state = await repository.read(scope);
  if (supportedReads.has(action)) {
    // Bulk online export must read every cloud page, even when only part is cached.
    if(action === "getAllCustomers" && navigator.onLine){
      const response=await cloudRead(input,init);const value=await response.clone().json();
      if(value.success)await cacheResponse(scope,value);return await hideLocallyDeleted(scope,value,response);
    }
    const query = fold(payload.query);
    const hits = state.records.filter(record => !record.deleted && (action === "getAllCustomers" || (action === "getCustomerByRowNumber" ? record.rowNumber === Number(payload.rowNumber) : query && ["enrolId","accountNo","name","pan","aofNo","contact","uidaiNo"].some(field => fold(record.customer[field]).includes(query)))));
    if (hits.length || !navigator.onLine) {
      if (!hits.length) return resultResponse({success:false,message:"Customer is not in this device's offline cache."});
      const first = hits[0];
      const page = Math.max(1,Number(payload.page)||1);const pageSize=Math.min(250,Math.max(1,Number(payload.pageSize)||50));
      const visible=action==="getAllCustomers"?hits.slice((page-1)*pageSize,page*pageSize):hits;
      const matches = visible.map(record => ({...record.customer, rowNumber:record.rowNumber, recordId:record.recordId, revision:record.revision}));
      return resultResponse({success:true,message:"Customer loaded from local database.",customer:{...first.customer,recordId:first.recordId,revision:first.revision},rowNumber:first.rowNumber,matches,multipleMatches:hits.length>1,customers:matches,hasNextPage:action==="getAllCustomers"&&page*pageSize<hits.length,local:true});
    }
    const response = await cloudRead(input, init);
    const value = await response.clone().json();
    if (value.success) await cacheResponse(scope, value);
    return await hideLocallyDeleted(scope,value,response);
  }
  if (action === "getBankFormatPreview") {
    const key=String(payload.formatType || "");
    if (!navigator.onLine && state.documents?.[key]) return resultResponse(state.documents[key]);
    const response=await cloudRead(input,init);const value=await response.clone().json();
    if (value.success) await repository.transact(scope,current=>{current.documents ||= {};current.documents[key]=value;});
    return response;
  }
  if (action === "checkDuplicate") {
    const customer=(payload.customer||{}) as Customer;
    const duplicate=state.records.find(record=>!record.deleted&&record.rowNumber!==Number(payload.excludeRowNumber)&&["accountNo","enrolId","uidaiNo"].some(key=>fold(customer[key])&&fold(record.customer[key])===fold(customer[key])));
    if(duplicate)return resultResponse({success:false,code:"DUPLICATE",message:"A matching customer is already saved on this device."});
    return resultResponse({success:true,message:"No duplicate in the local cache. Google duplicate check runs during sync."});
  }
  if (!supportedWrites.has(action)) return cloudRead(input, init);
  if(resetting.has(scope))return resultResponse({success:false,message:"Local reset is in progress. Retry after the Google download completes."});
  const customer = (payload.customer || {}) as Customer;
  const existing = state.records.find(record => payload.recordId ? record.recordId === String(payload.recordId) : record.rowNumber === Number(payload.rowNumber));
  if (action !== "saveCustomer" && !existing) return resultResponse({success:false,message:"Load this customer before editing so its stable identity can be verified."});
  const statusOnly = action === "updateCustomer" && payload.statusOnly === true;
  const statusField = String(payload.statusField || "");
  const statusValue = String(payload.statusValue || "").trim();
  if (statusOnly && (!existing?.recordId || existing.deleted || !["status","passbookStatus"].includes(statusField) || !allowedStatus(statusField,statusValue) || !["client_admin","client_user","master_owner","admin","user"].includes(sessionStorage.getItem("bankSetuAccountRole")||"")))
    return resultResponse({success:false,message:"A valid customer identity and status selection are required."});
  if (action === "deleteCustomer" && !["client_admin","master_owner","admin"].includes(sessionStorage.getItem("bankSetuAccountRole")||"")) return resultResponse({success:false,message:"Administrator permission is required."});
  if ((action === "saveCustomer" || (action === "updateCustomer" && !statusOnly)) && (!fold(customer.name) || !fold(customer.accountNo) || !fold(customer.enrolId) || String(customer.uidaiNo || "").replace(/\D/g, "").length !== 12)) return resultResponse({success:false,message:"Name, account number, customer ID and 12-digit Aadhaar are required."});
  if (action === "deleteCustomer" && (existing?.deleted || state.operations.some(op => op.recordId === existing?.recordId && op.state !== "pending")))
    return resultResponse({success:false,message:"Resolve this customer's pending review before deleting. Local data was unchanged."});
  const recordId = existing?.recordId || crypto.randomUUID();
  const operationId = crypto.randomUUID();
  let localRow = existing?.rowNumber || 0;
  await repository.transact(scope, current => {
    const previous = current.records.find(record => record.recordId === recordId);
    if(existing && (!previous || previous.deleted || previous.revision !== existing.revision || JSON.stringify(previous.customer)!==JSON.stringify(existing.customer)))
      throw new Error("Customer changed during this save. Reload and retry; no fields were overwritten.");
    if(action === "saveCustomer" && current.records.some(record=>!record.deleted && record.recordId!==recordId && ["accountNo","enrolId","uidaiNo"].some(key=>fold(customer[key])&&fold(customer[key])===fold(record.customer[key]))))
      throw new Error("A matching customer is already saved on this device. Duplicate save was blocked.");
    const combined = statusOnly ? {...previous?.customer,[statusField]:statusValue} : {...previous?.customer,...customer};
    if(customer.photoDataUrl)combined.photoPreview=customer.photoDataUrl;
    if(action === "markPassbookDelivered")combined.passbookStatus="DELIVERED";
    if(action === "markPassbookPrinted")combined.passbookStatus="PRINTED";
    if (!localRow) localRow = Math.max(0,...current.records.map(record => record.rowNumber)) + 1000000000;
    const record: CachedRecord = {key:recordId,scope,recordId,rowNumber:localRow,revision:previous?.revision || "",customer:combined,pending:true,deleted:action === "deleteCustomer"};
    current.records = current.records.filter(item => item.recordId !== recordId);current.records.push(record);
    const operation: QueueOperation = {key:operationId,scope,operationId,recordId,action,customer:action === "deleteCustomer" ? {} : statusOnly ? {[statusField]:statusValue} : combined,baseRevision:previous?.revision || "",rowNumber:localRow,createdAt:Date.now(),state:"pending",...(statusOnly?{statusOnly:true}:action==="updateCustomer"?{validationMode:"full" as const}:{})};
    current.operations.push(operation);
    if(JSON.stringify(current).length>90*1024*1024)throw new Error("Local storage limit reached. Sync or export existing pending records before adding more files; no new record was saved.");
  });
  announce();
  actionNotice("warning", action === "deleteCustomer" ? "Deleted locally" : "Saved locally", "Google Sheet and Drive sync pending.");
  if (syncPaused) resumeSync(); else window.dispatchEvent(new Event("banksetu-sync-request"));
  if (action === "deleteCustomer") {
    return resultResponse({success:false,deleted:true,queued:true,rowNumber:localRow,recordId,message:"Deleted locally; Google Sheet and Drive deletion is pending sync."});
  }
  return resultResponse({success:true,queued:true,rowNumber:localRow,recordId,
    message:"Saved on this device. Google sync starts immediately; keep this device's data until sync completes.",
    photo:customer.photoDataUrl ? {previewDataUrl:customer.photoDataUrl} : null});
}
async function hideLocallyDeleted(scope: string, value: Record<string, unknown>, response: Response): Promise<Response> {
  if (!value.success) return response;
  const state = await repository.read(scope);
  const tombstones = new Set(state.records.filter(record => record.deleted).map(record => record.recordId));
  if (!tombstones.size) return response;
  const visible = (items: unknown) => Array.isArray(items)
    ? items.filter(item => !tombstones.has(String((item as Customer)?.recordId || ""))) : items;
  const customer = value.customer as Customer | undefined;
  const customers = visible(value.customers);
  const matches = visible(value.matches);
  const masked: Record<string, unknown> = {...value, customers, matches};
  if (customer && tombstones.has(String(customer.recordId || ""))) masked.customer = (Array.isArray(matches) ? matches[0] : undefined) || (Array.isArray(customers) ? customers[0] : undefined);
  if (!masked.customer && (!Array.isArray(customers) || !customers.length) && (!Array.isArray(matches) || !matches.length))
    return resultResponse({success:false,message:"This customer was deleted locally; Google deletion is pending sync."});
  return resultResponse(masked);
}
function announce() { window.dispatchEvent(new Event("banksetu-sync-change")); }
async function cacheResponse(scope: string, value: Record<string, unknown>, checkpoint?: {cursor:number;seen:string[];startedAt:number;pageSize?:number}) {
  const list = (Array.isArray(value.customers) ? value.customers : value.customer ? [{...value.customer as Customer,rowNumber:value.rowNumber}] : []) as Customer[];
  await repository.transact(scope, state => {
    if (value.fullSnapshot === true) { const incoming = new Set(list.map(customer => String(customer.recordId))); state.records.forEach(record => { if (!record.pending && !incoming.has(record.recordId)) record.deleted = true; }); }
    for (const customer of list) {
      const recordId = String(customer.recordId || "");
      if (!recordId) continue;
      const previous = state.records.find(record => record.recordId === recordId);
      if (previous?.pending || previous?.deleted) continue;
      const samePhoto=previous?.customer.photoUrl===customer.photoUrl&&previous?.customer.enrolId===customer.enrolId;
      const record: CachedRecord = {key:recordId,scope,recordId,rowNumber:Number(customer.rowNumber),revision:String(customer.revision || ""),cachedAt:Date.now(),customer:{...customer,photoDataUrl:previous?.customer.photoDataUrl || customer.photoDataUrl, pdfDataUrl:previous?.customer.pdfDataUrl || customer.pdfDataUrl, photoPreview:customer.photoPreview || (samePhoto?previous?.customer.photoPreview:"") || ""},photoCheckedAt:samePhoto?previous?.photoCheckedAt:undefined,photoMissingRef:samePhoto?previous?.photoMissingRef:undefined,photoRetryAt:samePhoto?previous?.photoRetryAt:undefined,photoFailures:samePhoto?previous?.photoFailures:undefined,pending:false};
      if((value.photoNotFound===true||record.customer.photoAvailable===false)&&!record.customer.photoPreview){record.photoMissingRef=photoRef(record);record.photoRetryAt=undefined;record.photoFailures=undefined;}
      state.records = state.records.filter(item => item.recordId !== recordId);state.records.push(record);
    }
    const deleted=Array.isArray(value.deletedIds)?new Set(value.deletedIds.map(String)):new Set<string>();
    state.records.forEach(record => { if (!record.pending && deleted.has(record.recordId)) record.deleted = true; });
    if(checkpoint){
      const seen=new Set([...checkpoint.seen,...list.map(customer=>String(customer.recordId))]);
      if(value.hasNextPage){
        if(!Number.isSafeInteger(value.nextCursor)||Number(value.nextCursor)<=checkpoint.cursor)throw Error("Google returned an invalid sync cursor.");
        state.pull={...checkpoint,cursor:Number(value.nextCursor),seen:[...seen]};
      }else state.pull={cursor:0,seen:[],startedAt:Date.now(),lastCompletedAt:Date.now(),cacheLimited:state.pull?.cacheLimited,pageSize:checkpoint.pageSize};
    }
    trimCache(state);
  });
  announce();
}
const running = new Map<string, Promise<void>>();
const syncControllers = new Map<string, AbortController>();
const resetting = new Set<string>();
const syncErrors = new Map<string, string>();
let syncPaused = false;
export const isSyncPaused = () => syncPaused;
export function pauseSync() {
  if (syncPaused) return;
  syncPaused = true;
  for(const controller of syncControllers.values())controller.abort(new DOMException("Background sync paused on this device.","AbortError"));
  window.dispatchEvent(new Event("banksetu-sync-pause-change"));
  announce();
}
export function resumeSync() {
  const changed = syncPaused;
  syncPaused = false;
  if (changed) window.dispatchEvent(new Event("banksetu-sync-pause-change"));
  window.dispatchEvent(new Event("banksetu-sync-request"));
  announce();
}
type SyncProtection = {success?:boolean;code?:string;message?:string;protectionVersion?:number;connectionId?:string;resetId?:string;activeIds?:string[];deletedIds?:string[]};
const hasUnsyncedContent=(record:CachedRecord)=>!record.deleted&&(!record.revision||!!(record.customer.photoDataUrl&&!record.customer.photoUrl)||!!(record.customer.pdfDataUrl&&!record.customer.pdfUrl));
async function applySyncProtection(scope:string, protection:SyncProtection) {
  if(!protection.success){
    if(protection.code==="CONNECTION_CHANGED")throw new Error("Workspace connection changed. Reconnect this tenant's Google Sheet/Drive in Bank Setu; local changes remain pending.");
    if(protection.message)throw new Error(`Sync protection check failed: ${protection.message} Local changes remain pending.`);
  }
  if(!protection.success||protection.protectionVersion!==1||!Array.isArray(protection.activeIds)||!Array.isArray(protection.deletedIds))
    throw new Error("Sync protection could not be verified. Deploy the updated tenant Code.gs; local changes remain pending.");
  if(protection.connectionId!==sessionStorage.getItem("bankSetuConnectionId"))
    throw new Error("Sync protection belongs to another workspace connection. Reconnect this tenant's Google Sheet/Drive; local changes remain pending.");
  const active=new Set(protection.activeIds),deleted=new Set(protection.deletedIds);
  await repository.transact(scope,state=>{
    if(protection.resetId && state.resetId!==protection.resetId){
      if(state.operations.length||state.records.some(hasUnsyncedContent))
        throw new Error("A shared reset is pending. Back up and resolve this device's unsynced changes before clearing its local database; uploads are paused.");
      state.records=[];state.operations=[];state.pull=undefined;state.resetId=protection.resetId;
    }
    for(const record of state.records){
      if(!deleted.has(record.recordId)&&!(record.revision&&!active.has(record.recordId)))continue;
      record.deleted=true;
      for(const operation of state.operations.filter(op=>op.recordId===record.recordId)){
        if(operation.action==="deleteCustomer")state.operations=state.operations.filter(op=>op.operationId!==operation.operationId);
        else {operation.state="conflict";operation.error="This customer was removed from the tenant's Google Sheet. Stale changes were not uploaded.";operation.conflictSource="google";}
      }
      record.pending=false;
    }
  });
  announce();
}
export function syncNow(refresh = true, signal?:AbortSignal): Promise<void> {
  if (syncPaused || !navigator.onLine || !localModeEnabled() || sessionStorage.getItem("bankSetuWorkspaceReady") !== "true") return Promise.resolve();
  let scope: string;
  try { scope=identity(); } catch(error) { return Promise.reject(error); }
  if(resetting.has(scope))return Promise.reject(new Error("Local reset is in progress. Retry sync when it completes."));
  const existing=running.get(scope);if(existing)return existing;
  const controller=new AbortController();syncControllers.set(scope,controller);
  const combinedSignal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  const task=runSync(refresh,combinedSignal).then(()=>{syncErrors.delete(scope);}).catch(error=>{if(controller.signal.aborted && error instanceof DOMException && error.name==="AbortError"){syncErrors.delete(scope);return;}syncErrors.set(scope,error instanceof Error?error.message:String(error));throw error;}).finally(()=>{running.delete(scope);syncControllers.delete(scope);announce();});
  running.set(scope,task);announce();return task;
}
async function runSync(refresh: boolean, signal?:AbortSignal) {
  if (!navigator.onLine || !localModeEnabled()) return;
  const scope = identity();
  const url = sessionStorage.getItem("bankSetuBridgeUrl")!;
  const user = auth.currentUser!;
  const connectionId=sessionStorage.getItem("bankSetuConnectionId");
  const masterLocalSync=sessionStorage.getItem("bankSetuMasterLocalEnabled")==="true";
  const send=async(payload: Record<string,unknown>, photoSignal?:AbortSignal)=>{
    if(signal?.aborted||photoSignal?.aborted)throw signal?.reason||photoSignal?.reason||new DOMException("Sync stopped.","AbortError");
    let idToken=await user.getIdToken();
    if(signal?.aborted||photoSignal?.aborted)throw signal?.reason||photoSignal?.reason||new DOMException("Sync stopped.","AbortError");
    if(identity()!==scope)throw new Error("Workspace changed; previous sync stopped.");
    const requestSignal=AbortSignal.any([...(signal?[signal]:[]),...(photoSignal?[photoSignal]:[]),AbortSignal.timeout(25000)]);
    const perform=()=>networkFetch(url,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,connectionId,masterLocalSync,idToken}),signal:requestSignal});
    let response=await perform();
    let refreshed=false;
    if(response.status===401){idToken=await user.getIdToken(true);refreshed=true;if(identity()!==scope)throw new Error("Workspace changed.");response=await perform();}
    if(!response.ok){
      if(response.status===401||response.status===403){const error=new Error("Google access requires attention. Sign in or check this workspace's permissions; local changes remain pending.") as Error & {permanent:boolean};error.permanent=true;throw error;}
      const retryAfter=response.headers.get("Retry-After");
      const seconds=retryAfter?Number(retryAfter):NaN;
      const date=retryAfter&&!Number.isFinite(seconds)?Date.parse(retryAfter):NaN;
      const suggested=Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-Date.now():0;
      const error=new Error(`Google sync is temporarily unavailable (${response.status}). Local changes remain pending.`) as Error & {retryAfterMs?:number;status?:number};
      error.status=response.status;
      if([429,500,502,503,504].includes(response.status))error.retryAfterMs=Math.min(300000,Math.max(0,suggested));
      throw error;
    }
    let value=await response.json();
    if(!value.success&&value.code==="AUTH_REQUIRED"&&!refreshed){idToken=await user.getIdToken(true);refreshed=true;if(identity()!==scope)throw new Error("Workspace changed.");response=await perform();if(response.status===401||response.status===403)throw Object.assign(new Error("Google authentication needs attention. Sign in again; local changes remain pending."),{permanent:true});if(!response.ok)throw new Error(`Google sync is temporarily unavailable (${response.status}). Local changes remain pending.`);value=await response.json();}
    if(!value.success&&value.code==="AUTH_REQUIRED")throw Object.assign(new Error("Google authentication needs attention. Sign in again; local changes remain pending."),{permanent:true});
    if(identity()!==scope)throw new Error("Workspace changed; previous sync stopped.");
    if(!value.success && (value.code==="SYNC_BUSY" || /Lock timeout|another process was holding the lock/i.test(String(value.message||""))))
      throw new Error("Google sync is busy on another request. Pending changes are retained and will retry automatically.");
    return value;
  };
  const initial = await repository.read(scope);
  if(initial.photoPresence)photoPresence.set(scope,{checkedAt:initial.photoPresence.checkedAt,ids:new Set(initial.photoPresence.customerIds)});
  const shouldPull=refresh || !!initial.pull?.cursor || !initial.pull?.lastCompletedAt || Date.now()-initial.pull.lastCompletedAt>=IDLE_RECONCILE_MS;
  const pending=initial.operations.some(operation=>operation.state==="pending");
  if(!shouldPull&&!pending&&!initial.records.some(needsPhoto))return;
  const protection=await send({action:"getSyncProtection"}) as SyncProtection;
  await applySyncProtection(scope,protection);
  if (initial.operations.some(operation => operation.state === "pending")) actionNotice("progress","Sync in progress","Uploading pending changes to Google Sheet and Drive.");
  for (const op of initial.operations.filter(operation => operation.state === "pending").slice(0,25)) {
    if (identity() !== scope || auth.currentUser?.uid !== user.uid) return;
    const current = await repository.read(scope);
    if (current.operations.some(item => item.recordId === op.recordId && item.state !== "pending")) continue;
    const record = current.records.find(item => item.recordId === op.recordId);
    let value=await send({action:"syncCustomerOperation",protectionResetId:protection.resetId||"",operation:{...op,baseRevision:record?.revision || op.baseRevision}});
    if(!value.success && String(value.message||"").includes("Valid name, account number, customer ID and Aadhaar are required"))
      value={...value,code:"INVALID_INPUT",message:`Pending ${op.action} needs valid customer identity fields. Complete Name, Account Number, Customer ID and Aadhaar before retrying. The local change is retained for review.`};
    if (op.action === "deleteCustomer" && !value.success && !["CONFLICT","DUPLICATE","CONNECTION_CHANGED","FORBIDDEN","INVALID_INPUT"].includes(String(value.code||"")))
      throw new Error(String(value.message || "Google deletion was rejected; pending delete retained for retry."));
    if (op.action === "deleteCustomer" && value.success && (value.deleted !== true || value.driveDeleted !== true || value.rowDeleted !== true))
      throw new Error("Google Sheet row and Drive deletion are not confirmed. Update this tenant's Apps Script bridge; local deletion remains pending.");
    await repository.transact(scope, state => {
      const queued = state.operations.find(item => item.operationId === op.operationId);
      if (!queued) return;
      if (!value.success && !["CONFLICT","DUPLICATE","CONNECTION_CHANGED","FORBIDDEN","INVALID_INPUT"].includes(String(value.code||"")))throw new Error(String(value.message||"Google temporarily rejected sync; will retry."));
      if (!value.success) { queued.state = value.code === "CONFLICT" ? "conflict" : "failed";queued.error=String(value.message || "Sync rejected");queued.remoteCustomer=value.customer;queued.conflictSource="google";return; }
      state.operations=state.operations.filter(item => item.operationId !== op.operationId);
      const saved=state.records.find(item => item.recordId === op.recordId);
      if (value.deleted) { const deletedRecord=state.records.find(item=>item.recordId===op.recordId); if (deletedRecord) deletedRecord.deleted=true; }
      if (saved) { if (!value.deleted) {saved.rowNumber=Number(value.rowNumber);saved.revision=String(value.revision);}saved.pending=state.operations.some(item=>item.recordId===op.recordId);if (!saved.pending && value.customer) saved.customer={...value.customer,photoDataUrl:saved.customer.photoDataUrl || value.customer.photoDataUrl,pdfDataUrl:saved.customer.pdfDataUrl || value.customer.pdfDataUrl}; }
    });
    if (value.success) actionNotice("success",op.action === "deleteCustomer" ? "Customer deleted" : "Cloud synced",op.action === "deleteCustomer" ? "Google Sheet row and Drive files confirmed deleted." : "Customer change synced to Google Sheet and Drive.");
  }
  // At most four 250-row pages per sync; resume the cursor on the next tick.
  const started=Date.now();
  for(let page=0;shouldPull && page<4 && Date.now()-started<20000;page++) {
    if(identity()!==scope)return;
    const state=await repository.read(scope);
    const pull=state.pull || {cursor:0,seen:[],startedAt:Date.now()};
    const pageSize=Math.min(250,Math.max(25,pull.pageSize||250));
    let value: Record<string,unknown>;
    try {value=await send({action:"getCustomerPage",cursor:pull.cursor,pageSize});}
    catch(error){
      const oversized=(error as {status?:number})?.status===413;
      const timedOut=error instanceof DOMException&&error.name==="TimeoutError";
      if((oversized||timedOut)&&pageSize>25){
        const smaller=Math.max(25,Math.floor(pageSize/2));
        await repository.transact(scope,current=>{
          if((current.pull?.cursor||0)===pull.cursor)current.pull={...pull,pageSize:smaller};
        });
        queueMicrotask(()=>window.dispatchEvent(new Event("banksetu-sync-request")));
        return;
      }
      throw error;
    }
    if(!value.success)throw new Error(String(value.message || "Google download rejected; local data retained."));
    // An old bridge without page support must be upgraded; never infer a complete snapshot.
    if(!Array.isArray(value.customers))throw new Error("Deploy the current client bridge to enable paged sync.");
    if(value.customers.some((customer:Customer)=>!customer.recordId))throw new Error("The Google bridge must return stable customer IDs before automatic download can continue.");
    if(value.hasNextPage && (!Number.isSafeInteger(value.nextCursor)||Number(value.nextCursor)<=pull.cursor))throw new Error("Google returned an invalid sync cursor.");
    // Page data and resume cursor must commit together across crash/restart.
    await cacheResponse(scope,value,pull);
    if(!value.hasNextPage)break;
  }
  const afterPull=await repository.read(scope);
  if(afterPull.operations.some(op=>op.state==="pending" && !initial.operations.some(previous=>previous.operationId===op.operationId)))
    queueMicrotask(()=>window.dispatchEvent(new Event("banksetu-sync-request")));
  const downloaded=await repository.read(scope);
  if(downloaded.photoPresence)photoPresence.set(scope,{checkedAt:downloaded.photoPresence.checkedAt,ids:new Set(downloaded.photoPresence.customerIds)});
  if(!downloaded.pull?.cursor && downloaded.records.some(record=>blankPhotoMetadata(record.customer)) &&
     (!downloaded.photoPresence||Date.now()-downloaded.photoPresence.checkedAt>IDLE_RECONCILE_MS) &&
     Date.now()-(photoInventoryRetry.get(scope)||0)>60000){
    photoInventoryRetry.set(scope,Date.now());
    try {
      const value=await send({action:"getPhotoPresence"});
      if(value.success&&value.complete===true&&value.connectionId===connectionId&&Array.isArray(value.customerIds)&&value.customerIds.every((id:unknown)=>typeof id==="string")){
        const presence={checkedAt:Date.now(),customerIds:value.customerIds as string[]};
        await repository.transact(scope,state=>{state.photoPresence=presence;});
        photoPresence.set(scope,{checkedAt:presence.checkedAt,ids:new Set(presence.customerIds)});
      }
    } catch { /* Optional photo inventory never prevents customer data sync. */ }
  }

  // Existing pending uploads always finish first. Legacy photo hydration uses
  // three concurrent Drive reads; a new save interrupts it at the next wave.
  if(!downloaded.pull?.cursor){
    const seen=new Set<string>();
    const photos=downloaded.records.filter(record=>{
      if(!needsPhoto(record)||seen.has(record.recordId))return false;
      seen.add(record.recordId);return true;
    }).sort((a,b)=>Number(!!b.customer.photoUrl)-Number(!!a.customer.photoUrl)||(b.cachedAt||0)-(a.cachedAt||0)).slice(0,12);
    const photoController=new AbortController();
    const prioritizeUpload=()=>photoController.abort(new DOMException("New customer change has priority.","AbortError"));
    window.addEventListener("banksetu-sync-request",prioritizeUpload);
    try{
      for(let index=0;index<photos.length&&!photoController.signal.aborted;index+=3){
        if((await repository.read(scope)).operations.some(op=>op.state==="pending"))break;
        const group=photos.slice(index,index+3);
        const outcomes=await Promise.allSettled(group.map(async record=>{
          const value=await send({action:"getCustomerByRowNumber",recordId:record.recordId,rowNumber:record.rowNumber},photoController.signal);
          if(!value.success)throw new Error(value.message || "Drive photo download failed; will retry.");
          if(!value.photoNotFound && !(value.customer as Customer|undefined)?.photoPreview)throw new Error("Drive photo response was incomplete; will retry.");
          if(photoController.signal.aborted||signal?.aborted)return;
          await cacheResponse(scope,value);
          await repository.transact(scope,state=>{const saved=state.records.find(item=>item.recordId===record.recordId);if(saved&&!saved.pending&&photoRef(saved)===photoRef(record)){
            saved.photoCheckedAt=Date.now();saved.photoFailures=undefined;saved.photoRetryAt=undefined;
            if(value.photoNotFound===true&&!saved.customer.photoPreview)saved.photoMissingRef=photoRef(saved);
          }});
        }));
        for(let i=0;i<outcomes.length;i++)if(outcomes[i].status==="rejected"&&!photoController.signal.aborted&&!signal?.aborted){
          const record=group[i];
          await repository.transact(scope,state=>{const saved=state.records.find(item=>item.recordId===record.recordId);if(saved&&!saved.pending&&!saved.deleted&&photoRef(saved)===photoRef(record)){
            saved.photoFailures=Math.min(6,(saved.photoFailures||0)+1);
            saved.photoRetryAt=Date.now()+Math.min(300000,5000*2**(saved.photoFailures-1));
          }});
        }
      }
    }finally{window.removeEventListener("banksetu-sync-request",prioritizeUpload);}
  }

}
function allowedStatus(field:string,value:string){return (field==="status"?["pending","active","inactive"]:field==="passbookStatus"?["pending","printed","delivered"]:[]).includes(value.toLowerCase());}
const photoPresence=new Map<string,{checkedAt:number;ids:Set<string>}>();
const photoInventoryRetry=new Map<string,number>();
function blankPhotoMetadata(customer:Customer) {
  return Object.prototype.hasOwnProperty.call(customer,"photoUrl")&&!String(customer.photoUrl||"").trim()&&!customer.photoId&&!customer.photoFileId&&!customer.photoDataUrl&&!customer.photoPreview&&customer.photoAvailable!==true;
}
function confirmedNoPhoto(record:CachedRecord) {
  if(!blankPhotoMetadata(record.customer))return false;
  if(record.customer.photoAvailable===false)return true;
  const presence=photoPresence.get(record.scope);
  const id=String(record.customer.enrolId||"").trim().replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,100);
  return !!presence&&Date.now()-presence.checkedAt<=IDLE_RECONCILE_MS&&!presence.ids.has(id);
}
function photoRef(record:CachedRecord){return `${record.customer.enrolId||""}|${record.customer.photoUrl||""}`;}
function photoCandidate(record: CachedRecord) {return !record.deleted&&!record.pending&&!!record.revision&&!!(record.customer.photoUrl||record.customer.enrolId)&&!record.customer.photoPreview&&record.photoMissingRef!==photoRef(record)&&!confirmedNoPhoto(record);}
function needsPhoto(record: CachedRecord) {return photoCandidate(record)&&(!record.photoRetryAt||Date.now()>=record.photoRetryAt)&&(!record.photoCheckedAt||Date.now()-record.photoCheckedAt>24*60*60*1000);}
function trimCache(state: import("./schema").LocalState) {
  // Permanent customer data and uploaded photo/PDF data are never removed.
  // Only transient previews are eligible for cache cleanup.
  if (state.records.length > 10000 || JSON.stringify(state).length > 80*1024*1024) {
    state.pull ||= {cursor:0,seen:[],startedAt:Date.now()};
    state.pull.cacheLimited = true;
  }
}
function activeRecords(records: CachedRecord[], operations: QueueOperation[]) {
  const seen=new Set<string>();
  const queued=new Set(operations.map(operation=>operation.recordId));
  return records.filter(record=>{
    if(record.deleted || !record.recordId || seen.has(record.recordId) || (!record.revision&&!record.pending&&!queued.has(record.recordId)))return false;
    seen.add(record.recordId);return true;
  });
}
export async function getActiveLocalCustomers() {
  const state=await repository.read(identity());
  return activeRecords(state.records,state.operations).sort((a,b)=>b.rowNumber-a.rowNumber).map(record=>({
    ...record.customer,rowNumber:record.rowNumber,recordId:record.recordId,
    photoDataUrl:undefined,pdfDataUrl:undefined,photoPreview:undefined,
  }));
}
// Export reads the same active, tenant-scoped records as the customer list.
// Photos are included only here; normal list/sync snapshots stay lightweight.
export async function getLocalExportCustomers() {
  const state=await repository.read(identity());
  return activeRecords(state.records,state.operations).sort((a,b)=>b.rowNumber-a.rowNumber).map(record=>({
    ...record.customer,rowNumber:record.rowNumber,recordId:record.recordId,
    pdfDataUrl:undefined,
  }));
}
export async function clearTemporaryLocalData() {
  const scope=identity();let cleared=0;
  await repository.transact(scope,state=>{
    for(const record of state.records){
      // Only downloaded Drive thumbnails are disposable. Originals, customer
      // records, tombstones, the sync cursor and every queued edit stay intact.
      if(record.pending || !record.customer.photoUrl || !record.customer.photoPreview)continue;
      delete record.customer.photoPreview;delete record.photoCheckedAt;cleared++;
    }
  });
  announce();return cleared;
}
export async function resetLocalDatabase() {
  if(!navigator.onLine)throw new Error("Connect to the internet before resetting local data.");
  if(!["client_admin","master_owner","admin"].includes(sessionStorage.getItem("bankSetuAccountRole")||""))throw new Error("Administrator permission is required.");
  const scope=identity();
  if(resetting.has(scope))throw new Error("A local reset is already in progress.");
  resetting.add(scope);
  try {
    await running.get(scope);
    const current=await repository.read(scope);
    if(current.operations.length||current.records.some(hasUnsyncedContent))
      throw new Error("Back up and resolve every pending or unsynced customer before resetting. Local data was not cleared.");
    const url=sessionStorage.getItem("bankSetuBridgeUrl")!;
    const connectionId=sessionStorage.getItem("bankSetuConnectionId");
    const user=auth.currentUser!;
    const send=async(action:string,resetId?:string)=>{
      const idToken=await user.getIdToken();
      if(identity()!==scope)throw new Error("Workspace changed during reset.");
      const response=await networkFetch(url,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({action,resetId,connectionId,masterLocalSync:sessionStorage.getItem("bankSetuMasterLocalEnabled")==="true",idToken}),signal:AbortSignal.timeout(25000)});
      if(!response.ok||identity()!==scope)throw new Error("Shared reset could not be verified. Local data was retained.");
      return await response.json() as SyncProtection;
    };
    await applySyncProtection(scope,await send("getSyncProtection"));
    const verified=await repository.read(scope);
    if(verified.operations.length||verified.records.some(hasUnsyncedContent))
      throw new Error("Unsynced changes remain on this device. Local data was not cleared.");
    const resetId=crypto.randomUUID();
    const published=await send("publishLocalReset",resetId);
    if(published.resetId!==resetId)throw new Error("Shared reset confirmation failed. Retry sync; local records were retained.");
    await applySyncProtection(scope,published);
  } finally {resetting.delete(scope);}
  await syncNow(true);
  const state=await repository.read(scope);
  if(state.pull?.cursor)throw new Error("Reset marker is applied; customer download is still in progress. Run Sync again to complete it.");
  return activeRecords(state.records,state.operations).length;
}
export async function getLocalStatus() { const scope=identity();const state=await repository.read(scope);if(state.photoPresence)photoPresence.set(scope,{checkedAt:state.photoPresence.checkedAt,ids:new Set(state.photoPresence.customerIds)});return {records:activeRecords(state.records,state.operations).length,syncing:running.has(identity()),paused:syncPaused,lastCompletedAt:state.pull?.lastCompletedAt||0,error:syncErrors.get(identity())||"",mediaPending:state.records.filter(photoCandidate).length,pending:state.operations.filter(op=>op.state==="pending").length,conflicts:state.operations.filter(op=>op.state!=="pending").length,downloading:!!state.pull?.cursor,cacheLimited:state.pull?.cacheLimited===true}; }
export async function getLocalSnapshot() {
  const state = await repository.read(identity());
  return {
    records: state.records.map(record => ({ ...record, customer: { ...record.customer, photoDataUrl: undefined, pdfDataUrl: undefined, photoPreview: undefined } })),
    operations: state.operations.map(operation => ({ ...operation, customer: { ...operation.customer, photoDataUrl: undefined, pdfDataUrl: undefined, photoPreview: undefined } })),
  };
}
export async function exportLocalBackup() { const state=await repository.read(identity());if(isAndroid()){await shareAndroidBackup(JSON.stringify(makeBackup(identity(),state),null,2));return;}const url=URL.createObjectURL(new Blob([JSON.stringify(makeBackup(identity(),state),null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="BankSetu-local-backup.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
let recoverWorkspace: ((signal?:AbortSignal)=>Promise<void>) | undefined;
let healthError="";
let lastBackendCheck=0,lastHostingCheck=0,nextRetryAt=0;
export function configureConnectionRecovery(recover: ((signal?:AbortSignal)=>Promise<void>) | undefined){recoverWorkspace=recover;lastBackendCheck=0;}
export function getConnectionHealth(){return {online:navigator.onLine,error:healthError,lastBackendCheck,lastHostingCheck,nextRetryAt};}
let syncUsers=0;
let stopScheduler: (()=>void) | undefined;
export function startLocalSync() {
  syncUsers++;
  if(!stopScheduler){
    let stopped=false,busy=false,failures=0,wakePending=false,refreshRequested=false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeController:AbortController|undefined;
    const tick=async()=>{
      if(stopped||syncPaused)return;if(busy){wakePending=true;return;}
      clearTimeout(timer);busy=true;let delay=IDLE_RECONCILE_MS,actionRequired=false;activeController=new AbortController();const signal=activeController.signal;
      try{
        if(navigator.onLine){
          if(recoverWorkspace && (!lastBackendCheck||Date.now()-lastBackendCheck>=IDLE_RECONCILE_MS||sessionStorage.getItem("bankSetuWorkspaceReady")!=="true")){
            await recoverWorkspace(signal);if(stopped||signal.aborted)return;lastBackendCheck=Date.now();
          }
          if(localModeEnabled()&&sessionStorage.getItem("bankSetuWorkspaceReady")==="true"){
            const scope=identity();const refresh=refreshRequested;refreshRequested=false;await syncNow(refresh,signal);if(stopped||signal.aborted)return;
            if(identity()===scope){const state=await repository.read(scope);if(state.pull?.cursor||state.operations.some(op=>op.state==="pending")||state.records.some(needsPhoto))delay=250;
              else {const waiting=state.records.filter(photoCandidate);if(waiting.length)delay=Math.min(delay,Math.max(250,Math.min(...waiting.map(record=>record.photoRetryAt||((record.photoCheckedAt||0)+24*60*60*1000)))-Date.now()));
                if(state.pull?.lastCompletedAt)delay=Math.min(delay,Math.max(250,state.pull.lastCompletedAt+IDLE_RECONCILE_MS-Date.now()));}}
          }
          if(!lastHostingCheck||Date.now()-lastHostingCheck>=IDLE_RECONCILE_MS){
            lastHostingCheck=Date.now();
            // Independent, low-frequency public version check; never blocks sync.
            void networkFetch("https://banksetu-app.web.app/version.json",{cache:"no-store",signal:AbortSignal.timeout(10000)}).catch(()=>undefined);
          }
          failures=0;healthError="";
        }
      }catch(error){if(signal.aborted&&signal.reason?.message==="Background sync paused on this device."){healthError="";failures=0;delay=250;}else if(signal.aborted&&(stopped||!navigator.onLine)){if(!stopped)healthError="Offline — local changes remain pending.";}else{healthError=error instanceof Error?error.message:String(error);actionRequired=!!(error as {permanent?:boolean})?.permanent;const backoff=Math.min(300000,5000*2**Math.min(failures++,6));delay=Math.max(Number((error as {retryAfterMs?:number})?.retryAfterMs)||0,Math.round(backoff*(0.8+Math.random()*0.4)));}}
      finally{
        activeController=undefined;busy=false;if(!stopped){if(syncPaused||actionRequired){clearTimeout(timer);nextRetryAt=0;announce();return;}if(!navigator.onLine){nextRetryAt=0;announce();return;}if(wakePending&&!failures)delay=250;wakePending=false;nextRetryAt=Date.now()+delay;timer=setTimeout(()=>void tick(),delay);announce();}
      }
    };
    const wake=(event?:Event)=>{if(syncPaused)return;if((event as CustomEvent<{refresh?:boolean}>|undefined)?.detail?.refresh)refreshRequested=true;failures=0;healthError="";void tick();};
    const pauseChanged=()=>{if(syncPaused){clearTimeout(timer);activeController?.abort(new DOMException("Background sync paused on this device.","AbortError"));nextRetryAt=0;announce();}else wake();};
    let wasOffline=!navigator.onLine;
    const reconnect=()=>{if(wasOffline){lastBackendCheck=0;refreshRequested=true;wasOffline=false;wake();}else if(!failures||Date.now()>=nextRetryAt)wake();};
    const offline=()=>{wasOffline=true;clearTimeout(timer);activeController?.abort(new DOMException("Network connection lost.","AbortError"));healthError="Offline — local changes remain pending.";announce();};
    const visibility=()=>{if(!busy&&document.visibilityState==="visible"&&navigator.onLine&&(!failures||Date.now()>=nextRetryAt))wake();};
    const focus=()=>{if(!busy&&navigator.onLine&&(!failures||Date.now()>=nextRetryAt))wake();};
    const workspace=()=>{if(!busy){lastBackendCheck=0;wake();}};
    window.addEventListener("online",reconnect);window.addEventListener("offline",offline);window.addEventListener("focus",focus);window.addEventListener("banksetu-workspace-change",workspace);window.addEventListener("banksetu-sync-request",wake);window.addEventListener("banksetu-sync-pause-change",pauseChanged);
    document.addEventListener("visibilitychange",visibility);wake();
    stopScheduler=()=>{stopped=true;clearTimeout(timer);activeController?.abort(new DOMException("Sync engine stopped.","AbortError"));window.removeEventListener("online",reconnect);window.removeEventListener("offline",offline);window.removeEventListener("focus",focus);window.removeEventListener("banksetu-workspace-change",workspace);window.removeEventListener("banksetu-sync-request",wake);window.removeEventListener("banksetu-sync-pause-change",pauseChanged);document.removeEventListener("visibilitychange",visibility);};
  }
  let released=false;
  return()=>{if(released)return;released=true;if(--syncUsers===0){stopScheduler?.();stopScheduler=undefined;healthError="";lastBackendCheck=0;}};
}

export async function getConflicts() { return (await repository.read(identity())).operations.filter(op=>op.state!=="pending"); }
export async function resolveConflict(operationId: string, choice: "local" | "cloud") {
  if (!["client_admin","master_owner","admin"].includes(sessionStorage.getItem("bankSetuAccountRole")||"")) throw new Error("Client Admin review is required.");
  const scope=identity();
  await repository.transact(scope,state=>{
    const op=state.operations.find(item=>item.operationId===operationId);
    if (!op || op.state==="pending") throw new Error("Conflict no longer exists.");
    const record=state.records.find(item=>item.recordId===op.recordId);
    if (choice==="cloud") {
      if (!op.remoteCustomer) throw new Error("No cloud version available. Export the rejected record for review.");
      state.operations=state.operations.filter(item=>item.recordId!==op.recordId);
      if(record){record.customer=op.remoteCustomer;record.revision=String(op.remoteCustomer.revision||"");record.rowNumber=Number(op.remoteCustomer.rowNumber);record.pending=false;record.deleted=false;}
    } else {
      if (op.state==="conflict" && !op.remoteCustomer) throw new Error("Original cloud record was removed. Export and review instead of recreating it automatically.");
      if(record && op.remoteCustomer)record.revision=String(op.remoteCustomer.revision||"");
      op.operationId=crypto.randomUUID();op.key=op.operationId;op.baseRevision=record?.revision||"";op.state="pending";delete op.error;delete op.remoteCustomer;delete op.conflictSource;
    }
  });announce();
}

export async function getDataIdToken(forceRefresh = false): Promise<string> {
  if (!auth.currentUser) throw new Error("Sign in again.");
  if (localModeEnabled()) { identity(); return ""; }
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function restoreLocalBackup(text: string) {
  const scope=identity();const backup=parseBackup(text,scope);
  let report={records:0,operations:0,conflicts:0};
  await repository.transact(scope,state=>{report=mergeBackup(state,backup);if(JSON.stringify(state).length>90*1024*1024)throw new Error("Merged backup exceeds local storage limit. Existing data was not changed.");});
  announce();return report;
}
