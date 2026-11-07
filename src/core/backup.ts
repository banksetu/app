import type { LocalState, CachedRecord, QueueOperation, SsaCampaignEntry, SsaCampaignOperation } from "./schema";
export type Backup = {version: 2; scope: string; exportedAt: string; records: CachedRecord[]; operations: QueueOperation[]; ssaEntries?:SsaCampaignEntry[]; ssaOperations?:SsaCampaignOperation[]};
const uuid = /^[a-f0-9-]{36}$/i;
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value==="object" && !Array.isArray(value);
export function makeBackup(scope: string, state: LocalState): Backup {
  return {version:2,scope,exportedAt:new Date().toISOString(),records:state.records,operations:state.operations,ssaEntries:state.ssaEntries||[],ssaOperations:state.ssaOperations||[]};
}
export function parseBackup(text: string, scope: string): Backup {
  if(text.length>90*1024*1024)throw new Error("Backup exceeds the 90 MB restore limit.");
  const value=JSON.parse(text);
  // v1 exports used explicit scope on every record/operation. Empty v1 backups cannot prove ownership.
  const inferred = value.version===1 ? (value.records?.[0]?.scope || value.operations?.[0]?.scope) : value.scope;
  if(!plain(value)||![1,2].includes(Number(value.version))||inferred!==scope||!Array.isArray(value.records)||!Array.isArray(value.operations))throw new Error("Choose a backup belonging to this user, tenant and Google connection.");
  const ids=new Set<string>();
  for(const record of value.records){
    if(!plain(record)||record.scope!==scope||typeof record.recordId!=="string"||!uuid.test(record.recordId)||record.key!==record.recordId||ids.has(record.recordId)||!Number.isSafeInteger(record.rowNumber)||Number(record.rowNumber)<2||typeof record.revision!=="string"||typeof record.pending!=="boolean"||!plain(record.customer))throw new Error("Backup contains an invalid or duplicate customer identity.");
    ids.add(record.recordId);
  }
  const operations=new Set<string>();
  for(const op of value.operations){
    if(!plain(op)||op.scope!==scope||typeof op.operationId!=="string"||!uuid.test(op.operationId)||op.key!==op.operationId||operations.has(op.operationId)||!ids.has(String(op.recordId))||!["saveCustomer","updateCustomer","deleteCustomer","markPassbookDelivered","markPassbookPrinted","markAfsmSent"].includes(String(op.action))||!["pending","conflict","failed"].includes(String(op.state))||typeof op.baseRevision!=="string"||!Number.isFinite(op.createdAt)||!plain(op.customer))throw new Error("Backup contains an invalid queued operation.");
    operations.add(op.operationId);
  }
  if(value.ssaEntries!==undefined&&!Array.isArray(value.ssaEntries)||
     value.ssaOperations!==undefined&&!Array.isArray(value.ssaOperations))
    throw new Error("SSA Campaign backup has invalid entry or queue collections.");
  const ssaIds=new Set<string>();
  for(const entry of value.ssaEntries||[]){
    if(!plain(entry)||!uuid.test(String(entry.entryId||""))||ssaIds.has(entry.entryId)||
       !uuid.test(String(entry.customerRecordId||""))||typeof entry.accountNo!=="string"||
       typeof entry.customerId!=="string"||typeof entry.period!=="string"||
       !/^\d{4}-(0[1-9]|1[0-2])$/.test(entry.period)||
       !["apy","pmjjby","pmsby"].every(key=>typeof entry[key]==="boolean"))
      throw new Error("SSA Campaign backup has an invalid or duplicate entry.");
    ssaIds.add(entry.entryId);
  }
  const ssaOperations=new Set<string>();
  for(const op of value.ssaOperations||[]){
    if(!plain(op)||op.scope!==scope||!uuid.test(String(op.operationId||""))||
       ssaOperations.has(op.operationId)||!ssaIds.has(String(op.entryId||""))||
       !["create","update"].includes(String(op.mode))||
       !["pending","conflict","failed"].includes(String(op.state))||!plain(op.entry)||
       !Number.isFinite(op.createdAt)||!Number.isFinite(op.baseRevision))
      throw new Error("SSA Campaign backup has an invalid pending operation.");
    ssaOperations.add(op.operationId);
  }
  return {version:2,scope,exportedAt:String(value.exportedAt||""),records:value.records as CachedRecord[],
    operations:value.operations as QueueOperation[],ssaEntries:(value.ssaEntries||[]) as SsaCampaignEntry[],
    ssaOperations:(value.ssaOperations||[]) as SsaCampaignOperation[]};
}
export function mergeBackup(state: LocalState, backup: Backup): {records:number;operations:number;conflicts:number} {
  let records=0,operations=0,conflicts=0;
  const existingOps=new Set(state.operations.map(op=>op.operationId));
  const divergent=new Set<string>();
  for(const imported of backup.records){
    const existing=state.records.find(record=>record.recordId===imported.recordId);
    if(!existing){state.records.push(structuredClone(imported));records++;}
    else if(JSON.stringify(existing.customer)!==JSON.stringify(imported.customer))divergent.add(imported.recordId);
  }
  for(const imported of backup.operations){
    if(existingOps.has(imported.operationId))continue;
    const op=structuredClone(imported);
    if(divergent.has(op.recordId)){op.state="conflict";op.conflictSource="backup";op.error="Restored edit differs from this device's saved version. Review both versions before retrying.";const current=state.records.find(record=>record.recordId===op.recordId);op.remoteCustomer=current?{...current.customer,recordId:current.recordId,revision:current.revision,rowNumber:current.rowNumber}:undefined;conflicts++;}
    state.operations.push(op);existingOps.add(op.operationId);operations++;
  }
  const ssaExisting=new Set((state.ssaOperations||[]).map(op=>op.operationId));
  state.ssaEntries ||= [];state.ssaOperations ||= [];
  const divergentSsa=new Set<string>();
  for(const entry of backup.ssaEntries||[]){
    const local=state.ssaEntries.find(item=>item.entryId===entry.entryId);
    if(!local)state.ssaEntries.push(structuredClone(entry));
    else if(["period","entryDate","customerId","accountNo","apy","pmjjby","pmsby"].some(key=>
      JSON.stringify(local[key as keyof SsaCampaignEntry])!==JSON.stringify(entry[key as keyof SsaCampaignEntry])))
      divergentSsa.add(entry.entryId);
  }
  for(const op of backup.ssaOperations||[]){
    if(ssaExisting.has(op.operationId))continue;
    const imported=structuredClone(op);
    if(divergentSsa.has(imported.entryId)){
      imported.state="conflict";imported.error="Restored SSA entry differs from this device. Review before retrying.";
      imported.remoteEntry=state.ssaEntries.find(item=>item.entryId===imported.entryId);
      conflicts++;
    }
    state.ssaOperations.push(imported);ssaExisting.add(imported.operationId);operations++;
  }
  for(const record of state.records)record.pending=state.operations.some(op=>op.recordId===record.recordId);
  return {records,operations,conflicts};
}
