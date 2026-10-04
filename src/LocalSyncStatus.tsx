import { useEffect, useState } from "react";
import { localModeEnabled, exportLocalBackup, restoreLocalBackup, getConflicts, resolveConflict, getLocalStatus, startLocalSync, syncNow } from "./core/localData";
import type { QueueOperation } from "./core/schema";
export default function LocalSyncStatus({ visible = true }: { visible?: boolean }) {
  const [conflicts,setConflicts]=useState<QueueOperation[]>([]);
  const [status,setStatus]=useState({records:0,pending:0,conflicts:0,downloading:false,cacheLimited:false});const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{const refresh=()=>{void getLocalStatus().then(setStatus).then(()=>getConflicts()).then(setConflicts).catch(()=>undefined);};const stop=startLocalSync();const timer=setInterval(refresh,5000);window.addEventListener("banksetu-sync-change",refresh);refresh();return()=>{stop();clearInterval(timer);window.removeEventListener("banksetu-sync-change",refresh);};},[]);
  if (!visible) return null;
  if(!localModeEnabled()) return <aside aria-label="Local database sync" style={{padding:20,background:"#0b2630",color:"white",borderRadius:16}}><h2 style={{color:"white"}}>Sync & Backup</h2><p>Master का existing Google connection सुरक्षित है। Local sync चालू करने के लिए existing Master Apps Script में updated Code.gs लगाकर उसी deployment का New version deploy करें, फिर login करें।</p><a href="/client-bridge/Code.gs" download="BankSetu-Master-Code.gs" style={{color:"#64e6d0"}}>Download updated Master Code.gs</a></aside>;
  return <aside aria-label="Local database sync" style={{background:"#0b2630",color:"#eef7f7",padding:"8px 16px",borderRadius:16,display:"flex",flexWrap:"wrap",gap:12,alignItems:"center"}}>
    <h2 style={{width:"100%",color:"white",margin:"8px 0"}}>Sync & Backup</h2>
    <p style={{width:"100%",margin:0}}>Browser: IndexedDB · Windows: per-user SQLite. Browser close पर sync attempt best effort है; अधूरी queue अगली बार खुलने पर retry होगी।</p>
    <span>Local: {status.records} · Pending: {status.pending} · Review: {status.conflicts}</span>
    <button disabled={busy} onClick={()=>{setBusy(true);setError("");void syncNow().catch(reason=>setError(String(reason.message||reason))).finally(()=>setBusy(false));}}>Sync Now</button>
    <button onClick={()=>void exportLocalBackup().catch(reason=>setError(String(reason.message||reason)))}>Export backup</button>
    <label style={{cursor:"pointer"}}>Restore backup<input aria-label="Restore local backup" type="file" accept="application/json,.json" style={{maxWidth:220}} onChange={event=>{
      const file=event.target.files?.[0];event.target.value="";if(!file)return;
      if(file.size>90*1024*1024){setError("Backup exceeds 90 MB.");return;}
      if(!window.confirm("Merge this backup into the current workspace? Existing edits will be preserved; differences go to Review."))return;
      void file.text().then(restoreLocalBackup).then(report=>setError(`Restored ${report.records} records and ${report.operations} operations; ${report.conflicts} need review.`)).catch(reason=>setError(reason.message));
    }}/></label>
    {status.downloading&&<span>Downloading the next Google batch…</span>}
    {status.cacheLimited&&<span>Offline cache limit reached. Pending edits are retained; older cloud records remain searchable online.</span>}
    {error&&<span role="alert">{error}</span>}
    {status.conflicts>0&&<span role="alert">Conflicting/rejected records remain saved locally. Export them for administrator review.</span>}
    {["client_admin","master_owner","admin"].includes(sessionStorage.getItem("bankSetuAccountRole")||"")&&conflicts.map(op=><details key={op.operationId} style={{width:"100%"}}>
      <summary>{String(op.customer.name||op.recordId)} — {op.error}</summary>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>Local: {JSON.stringify({...op.customer,photoDataUrl:undefined,pdfDataUrl:undefined},null,2)}</pre><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{op.conflictSource==="backup"?"Saved on this device":"Google"}: {JSON.stringify(op.remoteCustomer||{},null,2)}</pre></div>
      <button onClick={()=>{if(window.confirm("Keep this queued version and retry against the displayed revision?"))void resolveConflict(op.operationId,"local").catch(reason=>setError(reason.message));}}>Keep local / retry</button>
      {op.remoteCustomer&&<button onClick={()=>{if(window.confirm("Use the displayed saved version and discard this record's pending local edits? Export a backup first."))void resolveConflict(op.operationId,"cloud").catch(reason=>setError(reason.message));}}>{op.conflictSource==="backup"?"Use current device version":"Use Google version"}</button>}
    </details>)}
  </aside>;
}
