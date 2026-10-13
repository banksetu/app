import { callBankSetuWorker } from '../workerApi';
import { auth } from '../firebase';
import { requireLicensedWrite } from './licenseAccess';
import { customerRepository } from './customerRepository';
import { identity, localModeEnabled, localDataFetch, getDataIdToken, resumeSync } from './localData';
import { getCustomerSearchApiUrl } from '../tenantApi';
import type { Customer } from './schema';

export { afsmBusinessDate, afsmDisplay } from "./afsmPolicy";
export async function searchAfsmCustomers(query:string):Promise<Customer[]> {
  const url=getCustomerSearchApiUrl(localModeEnabled());
  if(!url)throw Error('Connect this workspace to its Google Sheet first.');
  const scope=identity();
  const response=await localDataFetch(url,{method:'POST',body:JSON.stringify({action:'searchCustomer',query:query.trim(),idToken:await getDataIdToken(),masterLocalSync:true})});
  if(identity()!==scope)throw Error('Workspace changed. Search again.');
  const value=await response.json();
  if(!value.success)throw Error(value.message||'Customer not found.');
  return Array.isArray(value.matches)&&value.matches.length?value.matches:value.customer?[{...value.customer,rowNumber:value.rowNumber}]:[];
}
/** Atomic tenant-scoped batch, using the existing durable operation queue. No new rows. */
export async function markCustomersAfsmSent(scope:string, ids:string[], operationId:string, resend=false) {
  await requireLicensedWrite();
  if(!auth.currentUser || identity()!==scope)throw Error('Workspace changed. Generate the document again.');
  if(!localModeEnabled())throw Error('Enable the existing verified local workspace before confirming AFSM.');
  if(!['master_owner','master_admin','admin','client_admin','client_user','user'].includes(sessionStorage.getItem('bankSetuAccountRole')||''))throw Error('Customer write permission is required.');
  const unique=[...new Set(ids)];
  if(!unique.length || !/^[a-f0-9-]{36}$/i.test(operationId))throw Error('A valid generated customer batch is required.');
  let now=new Date().toISOString();
  if(navigator.onLine){
    try {
      const time=await callBankSetuWorker<{uid:string;tenantId:string;confirmedAt:string}>("/afsm-confirmation",{operationId});
      if(time.uid!==auth.currentUser?.uid||time.tenantId!==(sessionStorage.getItem("bankSetuTenantId")||"")||!Number.isFinite(Date.parse(time.confirmedAt)))throw Error("Invalid confirmation authority.");
      now=time.confirmedAt;
    }catch(error){
      const status=(error as {status?:number}).status;
      if(!(error instanceof TypeError || error instanceof DOMException && ["AbortError","TimeoutError"].includes(error.name) || status===429 || typeof status==="number" && status>=500))throw error;
    }
  }
  let updated=0;
  await customerRepository.transact(scope,state=>{
    if(identity()!==scope)throw Error('Workspace changed.');
    const records=unique.map(id=>state.records.find(record=>record.recordId===id&&!record.deleted));
    if(records.some(record=>!record))throw Error('One or more customers are no longer in this workspace. Reload the selection.');
    if(records.some(record=>state.operations.some(op=>op.recordId===record!.recordId&&op.state!=='pending')))throw Error('Resolve customer sync conflicts before confirming AFSM.');
    for(const record of records){
      if(!record || record.customer.afsmOperationId===operationId || (!resend&&record.customer.afsmStatus==='sent'))continue;
      const patch={afsmStatus:'sent',afsmSentAt:now,afsmOperationId:operationId,afsmUpdatedAt:now};
      const id=crypto.randomUUID();
      state.operations.push({key:id,scope,operationId:id,recordId:record.recordId,action:'markAfsmSent',customer:{...patch,afsmResend:resend},baseRevision:record.revision,rowNumber:record.rowNumber,createdAt:Date.now(),state:'pending'});
      record.customer={...record.customer,...patch};record.pending=true;updated++;
    }
  });
  window.dispatchEvent(new Event('banksetu-sync-change'));resumeSync();
  return updated;
}
