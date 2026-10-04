import type { LocalState, CachedRecord, QueueOperation } from "./schema";
export type Backup = {version: 2; scope: string; exportedAt: string; records: CachedRecord[]; operations: QueueOperation[]};
const uuid = /^[a-f0-9-]{36}$/i;
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value==="object" && !Array.isArray(value);
export function makeBackup(scope: string, state: LocalState): Backup {
  return {version:2,scope,exportedAt:new Date().toISOString(),records:state.records,operations:state.operations};
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
    if(!plain(op)||op.scope!==scope||typeof op.operationId!=="string"||!uuid.test(op.operationId)||op.key!==op.operationId||operations.has(op.operationId)||!ids.has(String(op.recordId))||!["saveCustomer","updateCustomer","deleteCustomer","markPassbookDelivered","markPassbookPrinted"].includes(String(op.action))||!["pending","conflict","failed"].includes(String(op.state))||typeof op.baseRevision!=="string"||!Number.isFinite(op.createdAt)||!plain(op.customer))throw new Error("Backup contains an invalid queued operation.");
    operations.add(op.operationId);
  }
  return {version:2,scope,exportedAt:String(value.exportedAt||""),records:value.records as CachedRecord[],operations:value.operations as QueueOperation[]};
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
    if(divergent.has(op.recordId)){op.state="conflict";op.error="Restored edit differs from this device's saved version. Review both versions before retrying.";const current=state.records.find(record=>record.recordId===op.recordId);op.remoteCustomer=current?{...current.customer,recordId:current.recordId,revision:current.revision,rowNumber:current.rowNumber}:undefined;conflicts++;}
    state.operations.push(op);existingOps.add(op.operationId);operations++;
  }
  for(const record of state.records)record.pending=state.operations.some(op=>op.recordId===record.recordId);
  return {records,operations,conflicts};
}
