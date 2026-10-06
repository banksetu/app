import { isAndroid, shareAndroidBackup } from "../platform/android/runtime";
import { makeBackup, parseBackup, mergeBackup } from "./backup";
import { auth } from "../firebase";
import { customerRepository as repository } from "./customerRepository";
import type { Customer, CachedRecord, QueueOperation } from "./schema";
export const networkFetch = globalThis.fetch.bind(globalThis);
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
const fold = (value: unknown) => String(value ?? "").trim().toLowerCase();
const supportedReads = new Set(["searchCustomer", "getCustomerByRowNumber", "getAllCustomers"]);
const supportedWrites = new Set(["saveCustomer", "updateCustomer", "deleteCustomer", "markPassbookDelivered", "markPassbookPrinted"]);
export async function localDataFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!localModeEnabled() || init?.method !== "POST" || typeof init.body !== "string") return networkFetch(input, init);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(init.body); } catch { return networkFetch(input, init); }
  const url = String(input);
  if (url !== sessionStorage.getItem("bankSetuBridgeUrl")) return networkFetch(input, init);
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
      if(value.success)await cacheResponse(scope,value);return response;
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
    return response;
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
  const customer = (payload.customer || {}) as Customer;
  const existing = state.records.find(record => record.rowNumber === Number(payload.rowNumber));
  if (action !== "saveCustomer" && !existing) return resultResponse({success:false,message:"Load this customer before editing so its stable identity can be verified."});
  if (action === "deleteCustomer" && !["client_admin","master_owner","admin"].includes(sessionStorage.getItem("bankSetuAccountRole")||"")) return resultResponse({success:false,message:"Administrator permission is required."});
  if (action === "saveCustomer" && (!fold(customer.name) || !fold(customer.accountNo) || !fold(customer.enrolId) || String(customer.uidaiNo || "").replace(/\D/g, "").length !== 12)) return resultResponse({success:false,message:"Name, account number, customer ID and 12-digit Aadhaar are required."});
  const recordId = existing?.recordId || crypto.randomUUID();
  const operationId = crypto.randomUUID();
  const combined = {...existing?.customer, ...customer};
  if(customer.photoDataUrl)combined.photoPreview=customer.photoDataUrl;
  if (action === "markPassbookDelivered") combined.passbookStatus = "DELIVERED";
  if (action === "markPassbookPrinted") combined.passbookStatus = "PRINTED";
  let localRow = existing?.rowNumber || 0;
  await repository.transact(scope, current => {
    const previous = current.records.find(record => record.recordId === recordId);
    if (!localRow) localRow = Math.max(0,...current.records.map(record => record.rowNumber)) + 1000000000;
    const record: CachedRecord = {key:recordId,scope,recordId,rowNumber:localRow,revision:previous?.revision || "",customer:combined,pending:true,deleted:action === "deleteCustomer"};
    current.records = current.records.filter(item => item.recordId !== recordId);current.records.push(record);
    const operation: QueueOperation = {key:operationId,scope,operationId,recordId,action,customer:combined,baseRevision:previous?.revision || "",rowNumber:localRow,createdAt:Date.now(),state:"pending"};
    current.operations.push(operation);
    if(JSON.stringify(current).length>90*1024*1024)throw new Error("Local storage limit reached. Sync or export existing pending records before adding more files; no new record was saved.");
  });
  announce();
  window.dispatchEvent(new Event("banksetu-sync-request"));
  if (navigator.onLine) void syncNow(false).catch(() => undefined);
  return resultResponse({success:true,queued:true,rowNumber:localRow,recordId,message:"Saved on this device. Pending Google sync; keep this device's data until sync completes.",photo:customer.photoDataUrl ? {previewDataUrl:customer.photoDataUrl} : null});
}
function announce() { window.dispatchEvent(new Event("banksetu-sync-change")); }
async function cacheResponse(scope: string, value: Record<string, unknown>) {
  const list = (Array.isArray(value.customers) ? value.customers : value.customer ? [{...value.customer as Customer,rowNumber:value.rowNumber}] : []) as Customer[];
  await repository.transact(scope, state => {
    if (value.fullSnapshot === true) { const incoming = new Set(list.map(customer => String(customer.recordId))); state.records.forEach(record => { if (!record.pending && !incoming.has(record.recordId)) record.deleted = true; }); }
    for (const customer of list) {
      const recordId = String(customer.recordId || "");
      if (!recordId) continue;
      const previous = state.records.find(record => record.recordId === recordId);
      if (previous?.pending) continue;
      const record: CachedRecord = {key:recordId,scope,recordId,rowNumber:Number(customer.rowNumber),revision:String(customer.revision || ""),cachedAt:Date.now(),customer:{...customer,photoDataUrl:previous?.customer.photoDataUrl || customer.photoDataUrl, pdfDataUrl:previous?.customer.pdfDataUrl || customer.pdfDataUrl, photoPreview:customer.photoPreview || (previous?.customer.photoUrl===customer.photoUrl?previous?.customer.photoPreview:"") || ""},photoCheckedAt:previous?.customer.photoUrl===customer.photoUrl?previous?.photoCheckedAt:undefined,pending:false};
      state.records = state.records.filter(item => item.recordId !== recordId);state.records.push(record);
    }
    const deleted=Array.isArray(value.deletedIds)?new Set(value.deletedIds.map(String)):new Set<string>();
    state.records.forEach(record => { if (!record.pending && deleted.has(record.recordId)) record.deleted = true; });
    trimCache(state);
  });
  announce();
}
const running = new Map<string, Promise<void>>();
const syncErrors = new Map<string, string>();
export function syncNow(refresh = true, signal?:AbortSignal): Promise<void> {
  if (!navigator.onLine || !localModeEnabled() || sessionStorage.getItem("bankSetuWorkspaceReady") !== "true") return Promise.resolve();
  let scope: string;
  try { scope=identity(); } catch(error) { return Promise.reject(error); }
  const existing=running.get(scope);if(existing)return existing;
  const task=runSync(refresh,signal).then(()=>{syncErrors.delete(scope);}).catch(error=>{syncErrors.set(scope,error instanceof Error?error.message:String(error));throw error;}).finally(()=>{running.delete(scope);announce();});
  running.set(scope,task);announce();return task;
}
async function runSync(refresh: boolean, signal?:AbortSignal) {
  if (!navigator.onLine || !localModeEnabled()) return;
  const scope = identity();
  const url = sessionStorage.getItem("bankSetuBridgeUrl")!;
  const user = auth.currentUser!;
  const connectionId=sessionStorage.getItem("bankSetuConnectionId");
  const masterLocalSync=sessionStorage.getItem("bankSetuMasterLocalEnabled")==="true";
  const send=async(payload: Record<string,unknown>)=>{
    if(signal?.aborted)throw signal.reason||new DOMException("Sync stopped.","AbortError");
    let idToken=await user.getIdToken();
    if(signal?.aborted)throw signal.reason||new DOMException("Sync stopped.","AbortError");
    if(identity()!==scope)throw new Error("Workspace changed; previous sync stopped.");
    const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000);
    const perform=()=>networkFetch(url,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,connectionId,masterLocalSync,idToken}),signal:requestSignal});
    let response=await perform();
    if(response.status===401){idToken=await user.getIdToken(true);if(identity()!==scope)throw new Error("Workspace changed.");response=await perform();}
    if(!response.ok)throw new Error("Google sync is temporarily unavailable. Local data retained.");
    let value=await response.json();
    if(!value.success&&value.code==="AUTH_REQUIRED"){idToken=await user.getIdToken(true);if(identity()!==scope)throw new Error("Workspace changed.");response=await perform();value=await response.json();}
    if(identity()!==scope)throw new Error("Workspace changed; previous sync stopped.");
    return value;
  };
  const initial = await repository.read(scope);
  for (const op of initial.operations.filter(operation => operation.state === "pending").slice(0,25)) {
    if (identity() !== scope || auth.currentUser?.uid !== user.uid) return;
    const current = await repository.read(scope);
    if (current.operations.some(item => item.recordId === op.recordId && item.state !== "pending")) continue;
    const record = current.records.find(item => item.recordId === op.recordId);
    const value=await send({action:"syncCustomerOperation",operation:{...op,baseRevision:record?.revision || op.baseRevision}});
    await repository.transact(scope, state => {
      const queued = state.operations.find(item => item.operationId === op.operationId);
      if (!queued) return;
      if (!value.success && !["CONFLICT","DUPLICATE","CONNECTION_CHANGED","FORBIDDEN","INVALID_INPUT"].includes(String(value.code||"")))throw new Error(String(value.message||"Google temporarily rejected sync; will retry."));
      if (!value.success) { queued.state = value.code === "CONFLICT" ? "conflict" : "failed";queued.error=String(value.message || "Sync rejected");queued.remoteCustomer=value.customer;queued.conflictSource="google";return; }
      state.operations=state.operations.filter(item => item.operationId !== op.operationId);
      const saved=state.records.find(item => item.recordId === op.recordId);
      if (value.deleted) { const deletedRecord=state.records.find(item=>item.recordId===op.recordId); if (deletedRecord) deletedRecord.deleted=true; }
      if (saved) { saved.rowNumber=Number(value.rowNumber);saved.revision=String(value.revision);saved.pending=state.operations.some(item=>item.recordId===op.recordId);if (!saved.pending && value.customer) saved.customer={...value.customer,photoDataUrl:saved.customer.photoDataUrl || value.customer.photoDataUrl,pdfDataUrl:saved.customer.pdfDataUrl || value.customer.pdfDataUrl}; }
    });
  }
  // At most four 250-row pages per sync; resume the cursor on the next tick.
  const started=Date.now();
  const shouldPull=refresh || !!initial.pull?.cursor || !initial.pull?.lastCompletedAt || Date.now()-initial.pull.lastCompletedAt>=60000;
  for(let page=0;shouldPull && page<4 && Date.now()-started<20000;page++) {
    if(identity()!==scope)return;
    const state=await repository.read(scope);
    const pull=state.pull || {cursor:0,seen:[],startedAt:Date.now()};
    const value=await send({action:"getCustomerPage",cursor:pull.cursor,pageSize:250});
    if(!value.success)throw new Error(value.message || "Google download rejected; local data retained.");
    // An old bridge without page support must be upgraded; never infer a complete snapshot.
    if(!Array.isArray(value.customers))throw new Error("Deploy the current client bridge to enable paged sync.");
    if(value.customers.some((customer:Customer)=>!customer.recordId))throw new Error("The Google bridge must return stable customer IDs before automatic download can continue.");
    if(value.hasNextPage && (!Number.isSafeInteger(value.nextCursor)||value.nextCursor<=pull.cursor))throw new Error("Google returned an invalid sync cursor.");
    await cacheResponse(scope,value);
    await repository.transact(scope,current=>{
      const seen=new Set([...pull.seen,...value.customers.map((customer:Customer)=>String(customer.recordId))]);
      if(value.hasNextPage && (!Number.isSafeInteger(value.nextCursor)||value.nextCursor<=pull.cursor))throw new Error("Google returned an invalid sync cursor.");
      if(value.hasNextPage)current.pull={...pull,cursor:value.nextCursor,seen:[...seen]};
      else {
        // Only explicit server tombstones delete records: rows can move during pagination.
        current.pull={cursor:0,seen:[],startedAt:Date.now(),lastCompletedAt:Date.now(),cacheLimited:current.pull?.cacheLimited};
      }
    });
    if(!value.hasNextPage)break;
  }
  const downloaded=await repository.read(scope);
  // Hydrate linked Drive photos in the background, never on the search path.
  if(!downloaded.pull?.cursor){
    const photos=downloaded.records.filter(needsPhoto).slice(0,10);
    for(const record of photos){
      const value=await send({action:"getCustomerByRowNumber",recordId:record.recordId,rowNumber:record.rowNumber});
      if(!value.success)throw new Error(value.message || "Drive photo download failed; will retry.");
      await cacheResponse(scope,value);
      await repository.transact(scope,state=>{const saved=state.records.find(item=>item.recordId===record.recordId);if(saved&&!saved.pending)saved.photoCheckedAt=Date.now();});
    }
  }

}
function needsPhoto(record: CachedRecord) {return !record.deleted&&!record.pending&&!!(record.customer.photoUrl||record.customer.enrolId)&&!record.customer.photoPreview&&(!record.photoCheckedAt||Date.now()-record.photoCheckedAt>24*60*60*1000);}
function trimCache(state: import("./schema").LocalState) {
  // Permanent customer data and uploaded photo/PDF data are never removed.
  // Only transient previews are eligible for cache cleanup.
  if (state.records.length > 10000 || JSON.stringify(state).length > 80*1024*1024) {
    state.pull ||= {cursor:0,seen:[],startedAt:Date.now()};
    state.pull.cacheLimited = true;
  }
}
export async function getLocalStatus() { const state=await repository.read(identity());return {records:state.records.filter(record=>!record.deleted).length,syncing:running.has(identity()),lastCompletedAt:state.pull?.lastCompletedAt||0,error:syncErrors.get(identity())||"",mediaPending:state.records.filter(needsPhoto).length,pending:state.operations.filter(op=>op.state==="pending").length,conflicts:state.operations.filter(op=>op.state!=="pending").length,downloading:!!state.pull?.cursor,cacheLimited:state.pull?.cacheLimited===true}; }
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
      if(stopped)return;if(busy){wakePending=true;return;}
      clearTimeout(timer);busy=true;let delay=60000;activeController=new AbortController();const signal=activeController.signal;
      try{
        if(navigator.onLine){
          if(recoverWorkspace && (!lastBackendCheck||Date.now()-lastBackendCheck>=5*60000||sessionStorage.getItem("bankSetuWorkspaceReady")!=="true")){
            await recoverWorkspace(signal);if(stopped||signal.aborted)return;lastBackendCheck=Date.now();
          }
          if(localModeEnabled()&&sessionStorage.getItem("bankSetuWorkspaceReady")==="true"){
            const scope=identity();const refresh=refreshRequested;refreshRequested=false;await syncNow(refresh,signal);if(stopped||signal.aborted)return;
            if(identity()===scope){const state=await repository.read(scope);if(state.pull?.cursor||state.operations.some(op=>op.state==="pending")||state.records.some(needsPhoto))delay=250;}
          }
          if(!lastHostingCheck||Date.now()-lastHostingCheck>=15*60000){
            lastHostingCheck=Date.now();
            // Independent, low-frequency public version check; never blocks sync.
            void networkFetch("https://banksetu-app.web.app/version.json",{cache:"no-store",signal:AbortSignal.timeout(10000)}).catch(()=>undefined);
          }
          failures=0;healthError="";
        }
      }catch(error){if(signal.aborted&&(stopped||!navigator.onLine)){if(!stopped)healthError="Offline — local changes remain pending.";}else{healthError=error instanceof Error?error.message:String(error);delay=Math.min(300000,5000*2**Math.min(failures++,6));}}
      finally{
        if(activeController===activeController&&signal.aborted)activeController=undefined;else activeController=undefined;
        busy=false;if(!stopped){if(!navigator.onLine){nextRetryAt=0;announce();return;}if(wakePending&&!failures)delay=250;wakePending=false;nextRetryAt=Date.now()+delay;timer=setTimeout(()=>void tick(),delay);announce();}
      }
    };
    const wake=(event?:Event)=>{if((event as CustomEvent<{refresh?:boolean}>|undefined)?.detail?.refresh)refreshRequested=true;failures=0;healthError="";void tick();};
    const reconnect=()=>{lastBackendCheck=0;wake();};
    const offline=()=>{clearTimeout(timer);activeController?.abort(new DOMException("Network connection lost.","AbortError"));healthError="Offline — local changes remain pending.";announce();};
    const visibility=()=>{if(document.visibilityState==="visible"&&navigator.onLine)wake();};
    const focus=()=>{if(navigator.onLine)wake();};
    const workspace=()=>{if(!busy)wake();};
    window.addEventListener("online",reconnect);window.addEventListener("offline",offline);window.addEventListener("focus",focus);window.addEventListener("banksetu-workspace-change",workspace);window.addEventListener("banksetu-sync-request",wake);
    document.addEventListener("visibilitychange",visibility);wake();
    stopScheduler=()=>{stopped=true;clearTimeout(timer);activeController?.abort(new DOMException("Sync engine stopped.","AbortError"));window.removeEventListener("online",reconnect);window.removeEventListener("offline",offline);window.removeEventListener("focus",focus);window.removeEventListener("banksetu-workspace-change",workspace);window.removeEventListener("banksetu-sync-request",wake);document.removeEventListener("visibilitychange",visibility);};
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
