import { auth } from "../firebase";
import { requireLicensedWrite } from "./licenseAccess";
import { customerRepository } from "./customerRepository";
import { identity, localDataFetch } from "./localData";
import type { SsaCampaignEntry, SsaCampaignOperation } from "./schema";

export type { SsaCampaignEntry } from "./schema";
export type SsaCampaignDraft = Pick<SsaCampaignEntry,
  "entryDate"|"customerRecordId"|"customerId"|"accountNo"|"name"|"apy"|"pmjjby"|"pmsby">;
type SsaResponse = {
  success?:boolean;code?:string;message?:string;entries?:SsaCampaignEntry[];
  entry?:SsaCampaignEntry;hasMore?:boolean;sheetName?:string;
};
const uuid=/^[a-f0-9-]{36}$/i;
const isDemo=()=>sessionStorage.getItem("bankSetuConnectionMode")==="demo";
const periodOf=(date:string)=>date.slice(0,7);

function checkedEntry(value:SsaCampaignEntry):SsaCampaignEntry {
  if(!uuid.test(value.entryId)||!uuid.test(value.customerRecordId)||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.period)||
    !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value.entryDate)||
    periodOf(value.entryDate)!==value.period||
    !value.customerId||!value.accountNo)throw new Error("Google returned an invalid SSA entry; local changes were retained.");
  return value;
}
export async function localSsaCampaignEntries():Promise<SsaCampaignEntry[]> {
  const state=await customerRepository.read(identity());
  const entries=state.ssaEntries||[];
  const queued=state.ssaOperations||[];
  return entries.map(entry=>{
    const failed=queued.find(op=>op.entryId===entry.entryId&&op.state!=="pending");
    return {...entry,pending:queued.some(op=>op.entryId===entry.entryId&&op.state==="pending"),
      syncError:failed?.error||""};
  }).sort((a,b)=>b.entryDate.localeCompare(a.entryDate)||b.updatedAt.localeCompare(a.updatedAt));
}
async function bridgeRequest(payload:Record<string,unknown>):Promise<SsaResponse> {
  const url=sessionStorage.getItem("bankSetuBridgeUrl")||"";
  const scope=identity(),user=auth.currentUser;
  if(!url||!user)throw new Error("Connect your verified Google workspace first.");
  const idToken=await user.getIdToken();
  if(scope!==identity())throw new Error("Workspace changed; no data was modified.");
  const response=await localDataFetch(url,{method:"POST",
    headers:{"content-type":"text/plain;charset=utf-8"},
    body:JSON.stringify({...payload,connectionId:sessionStorage.getItem("bankSetuConnectionId"),
      masterLocalSync:sessionStorage.getItem("bankSetuMasterLocalEnabled")==="true",idToken}),
    signal:AbortSignal.timeout(25000)});
  if(scope!==identity())throw new Error("Workspace changed; local data was retained.");
  if(!response.ok)throw new Error("SSA Campaign Google Sheet is temporarily unavailable.");
  const data=await response.json() as SsaResponse;
  if(!data.success)throw new Error(
    data.code==="INVALID_ACTION"?"Update this tenant's Apps Script Code.gs to enable SSA Campaign.":data.message||"SSA Campaign could not be loaded.");
  return data;
}
/** Fetch on demand. Pending/failed local changes always take precedence. */
export async function refreshSsaCampaignEntries():Promise<{entries:SsaCampaignEntry[];hasMore:boolean}> {
  if(!navigator.onLine||isDemo())return {entries:await localSsaCampaignEntries(),hasMore:false};
  const scope=identity();
  const result=await bridgeRequest({action:"getSsaCampaignEntries",limit:5000});
  if(!Array.isArray(result.entries))throw new Error("Google returned an invalid SSA entries list.");
  const remote=result.entries.map(checkedEntry);
  await customerRepository.transact(scope,state=>{
    state.ssaEntries ||= [];
    const pending=new Set((state.ssaOperations||[]).map(op=>op.entryId));
    const old=new Map(state.ssaEntries.map(entry=>[entry.entryId,entry]));
    for(const entry of remote)if(!pending.has(entry.entryId))old.set(entry.entryId,{...entry,pending:false,syncError:""});
    state.ssaEntries=[...old.values()];
  });
  return {entries:await localSsaCampaignEntries(),hasMore:result.hasMore===true};
}
/** Save on the same encrypted Windows/IndexedDB workspace as customer operations.
 * The existing localData scheduler uploads the queue; no second sync engine. */
export async function queueSsaCampaignEntry(draft:SsaCampaignDraft,mode:"create"|"update",entryId?:string):Promise<SsaCampaignEntry> {
  await requireLicensedWrite();
  const scope=identity(),date=draft.entryDate.trim(),period=periodOf(date);
  if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)||
    !Number.isFinite(Date.parse(date+"T12:00:00"))||
    !uuid.test(draft.customerRecordId)||!draft.customerId.trim()||!draft.accountNo.trim())
    throw new Error("Select a customer and valid campaign date before saving.");
  if(![draft.apy,draft.pmjjby,draft.pmsby].some(Boolean))
    throw new Error("Select at least one of APY, PMJJBY or PMSBY.");
  const now=new Date().toISOString(),id=entryId||crypto.randomUUID();
  let saved!:SsaCampaignEntry;
  await customerRepository.transact(scope,state=>{
    state.ssaEntries ||= [];state.ssaOperations ||= [];
    const previous=state.ssaEntries.find(item=>item.entryId===id);
    if(mode==="create"&&previous)throw new Error("This SSA entry already exists. Use Update Entry.");
    if(mode==="update"&&!previous)throw new Error("Load an existing SSA entry before updating.");
    if(state.ssaOperations.some(op=>op.entryId===id&&op.state!=="pending"))
      throw new Error("Resolve the previous SSA sync error before editing this entry.");
    if(state.ssaEntries.some(item=>item.entryId!==id&&item.period===period&&item.accountNo===draft.accountNo.trim()))
      throw new Error("This customer already has an SSA entry in that month. Select it and update.");
    saved={...draft,entryDate:date,period,entryId:id,
      customerId:draft.customerId.trim(),accountNo:draft.accountNo.trim(),name:draft.name.trim(),
      createdAt:previous?.createdAt||now,updatedAt:now,revision:previous?.revision||0,pending:!isDemo()};
    const op:SsaCampaignOperation={operationId:crypto.randomUUID(),entryId:id,scope,mode:previous?"update":"create",
      entry:{...saved},baseRevision:previous?.revision||0,createdAt:Date.now(),state:"pending"};
    state.ssaEntries=state.ssaEntries.filter(item=>item.entryId!==id);
    state.ssaEntries.push(saved);
    if(!isDemo())state.ssaOperations.push(op);
    if(JSON.stringify(state).length>90*1024*1024)throw new Error("Local storage is full. No SSA entry was saved.");
  });
  if(!isDemo())window.dispatchEvent(new Event("banksetu-sync-request"));
  return saved;
}
