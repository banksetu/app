import {useCallback,useEffect,useMemo,useState} from "react";
import {callBankSetuWorker} from "./workerApi";
import {confirmAction} from "./uiDialogs";
import {validatePersistedLayoutDraft} from "./layoutDraftValidation.ts";
import "./MasterTemplateManager.css";

type TemplateStatus="pending"|"approved"|"rejected"|"deleted";
type TemplateEntry={
  id:string;bankName:string;mode:"passbook"|"accountOpening";
  status:TemplateStatus;originTenantId?:string;clientName?:string;
  submittedBy?:string;reviewedBy?:string;createdAt?:string;
  updatedAt?:string;reviewedAt?:string;deletedAt?:string;
  requestedOutput?:"quick"|"dotmatrix";requestedSlot?:number;version?:number;
  pageCount?:number;widthMm:number;heightMm:number;foldMm:number;printStartMm:number;
  pageSetup?:unknown;elements:Array<Record<string,unknown>>;
};
const statuses:TemplateStatus[]=["pending","approved","rejected","deleted"];
const label=(status:TemplateStatus)=>({
  pending:"Pending Approval",approved:"Approved",rejected:"Rejected",deleted:"Deleted"
})[status];
const formatType=(item:TemplateEntry)=>item.mode==="accountOpening"?
  "Account Opening":item.requestedOutput==="dotmatrix"?"Passbook Print / PR2":"Quick Passbook";
const safeFileName=(value:string)=>value.toLowerCase().replace(/[^a-z0-9-]+/g,"-").slice(0,55)||"bank";

export default function MasterTemplateManager({onBack}:{onBack:()=>void}){
  const [status,setStatus]=useState<TemplateStatus>("pending");
  const [items,setItems]=useState<TemplateEntry[]>([]);
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [filter,setFilter]=useState("");
  const [preview,setPreview]=useState<TemplateEntry|null>(null);
  const load=useCallback(async(next:TemplateStatus,offset=0,append=false)=>{
    setBusy(true);
    try{
      const response=await callBankSetuWorker<{success:boolean;templates:TemplateEntry[];nextOffset:number|null}>(
        "/list-layout-templates",{allBanks:true,status:next,offset});
      setItems(previous=>append?[...previous,...response.templates]:response.templates);
      setNextOffset(response.nextOffset??null);
      setMessage(response.templates.length?
        "Showing "+(append?offset+response.templates.length:response.templates.length)+" "+label(next).toLowerCase()+" templates.":
        append?"No more templates.":"No "+label(next).toLowerCase()+" templates found.");
    }catch(error){
      if(!append){setItems([]);setNextOffset(null);}
      setMessage(error instanceof Error?error.message:"Cannot load Master template catalog.");
    }finally{setBusy(false);}
  },[]);
  useEffect(()=>{setPreview(null);void load(status);},[load,status]);
  const shown=useMemo(()=>{
    const q=filter.trim().toLowerCase();
    if(!q)return items;
    return items.filter(item=>[
      item.bankName,item.clientName,item.originTenantId,item.submittedBy,
      item.requestedOutput,item.mode,item.id
    ].some(value=>String(value||"").toLowerCase().includes(q)));
  },[items,filter]);
  const decide=async(item:TemplateEntry,action:"approve"|"reject")=>{
    if(busy)return;
    if(!await confirmAction(
      (action==="approve"?"Approve":"Reject")+" the "+formatType(item)+
      " template for "+item.bankName+" submitted by "+(item.clientName||item.originTenantId||"this client")+"? "+
      "Approval does not replace physical printer verification."))return;
    setBusy(true);
    try{
      await callBankSetuWorker("/review-layout-template",{id:item.id,action});
      setPreview(null);
      await load(status);
      setMessage("Template "+action+" decision saved. "+(action==="approve"?"Client-side print activation may still require real hardware calibration.":""));
    }catch(error){setMessage(error instanceof Error?error.message:"Review action failed.");}
    finally{setBusy(false);}
  };
  const remove=async(item:TemplateEntry)=>{
    if(busy)return;
    if(!await confirmAction(
      "Master Admin: delete this "+formatType(item)+" catalog template for "+item.bankName+"? "+
      "No Client Admin approval will be requested. Any selected live slot using it will stop loading this template after refresh and use the existing bank fallback. "+
      "Template history will be retained for audit.","Delete shared template"))return;
    setBusy(true);
    try{
      await callBankSetuWorker("/delete-layout-template",{id:item.id,confirmDelete:true});
      setPreview(null);await load(status);
      setMessage("Template removed from active catalog and retained only as a Master audit record.");
    }catch(error){setMessage(error instanceof Error?error.message:"Template delete failed.");}
    finally{setBusy(false);}
  };
  const download=(item:TemplateEntry)=>{
    const raw={
      version:1,mode:item.mode,bankName:item.bankName,pageCount:item.pageCount??1,
      widthMm:item.widthMm,heightMm:item.heightMm,foldMm:item.foldMm,
      printStartMm:item.printStartMm,pageSetup:item.pageSetup,
      requestedOutput:item.requestedOutput??"quick",requestedSlot:item.requestedSlot??1,
      elements:item.elements.map(part=>({...part,value:"",imageData:undefined}))
    };
    if(!validatePersistedLayoutDraft(raw,item.mode,item.bankName)){
      setMessage("This saved template cannot be exported as an editable draft. Review the original layout.");return;
    }
    const json=JSON.stringify(raw,null,2);
    if(new Blob([json]).size>750*1024){
      setMessage("Template exceeds the 750 KB editable restore limit.");return;
    }
    const url=URL.createObjectURL(new Blob([json],{type:"application/json"}));
    const link=document.createElement("a");
    link.href=url;link.download=safeFileName(item.bankName)+"-"+(item.requestedOutput??"quick")+"-layout-"+
      (item.requestedSlot??1)+".json";
    link.click();window.setTimeout(()=>URL.revokeObjectURL(url),500);
  };
  return <main className="master-template-manager" aria-label="Master Admin Template Management">
    <header>
      <div><strong>Template Management</strong>
        <p>Master Admin · All banks and clients · Review and manage approved designs</p></div>
      <div className="master-template-header-actions">
        <button type="button" disabled={busy} onClick={()=>{void load(status);}}>Refresh</button>
        <button type="button" onClick={onBack}>Open Passbook Designer</button>
      </div>
    </header>
    <nav aria-label="Template approval status">
      {statuses.map(tab=><button type="button" key={tab} aria-pressed={tab===status}
        onClick={()=>{setItems([]);setNextOffset(null);setFilter("");setStatus(tab);}}>{label(tab)}</button>)}
    </nav>
    <div className="master-template-filter">
      <label>Search bank, client, designer or template ID
        <input type="search" value={filter} onChange={event=>setFilter(event.target.value)}
          placeholder="Bank name / client ID / PR2 or Quick"/>
      </label>
    </div>
    <p role="status" className="master-template-message">{busy?"Loading… ":null}{message}</p>
    {shown.length===0&&!busy?<p>No matching templates in this view.</p>:null}
    <div className="master-template-table-wrap">
      <table>
        <thead><tr><th>Bank</th><th>Client / Designer</th><th>Template Type</th><th>Slot</th><th>Submitted / Reviewed</th><th>Actions</th></tr></thead>
        <tbody>{shown.map(item=><tr key={item.id}>
          <td><strong>{item.bankName}</strong><small>ID: {item.id.slice(0,8)}…</small></td>
          <td>{item.clientName||item.originTenantId||"Client not labeled"}<small>Designer: {item.submittedBy||"Unrecorded"}</small></td>
          <td>{formatType(item)}</td>
          <td>Layout {item.requestedSlot??1}</td>
          <td>{item.createdAt?new Date(item.createdAt).toLocaleDateString():"—"}<small>{item.reviewedAt?"Reviewed "+new Date(item.reviewedAt).toLocaleDateString():""}</small></td>
          <td><div className="master-template-actions">
            <button type="button" disabled={busy} onClick={()=>setPreview(item)}>Preview</button>
            <button type="button" disabled={busy} onClick={()=>download(item)}>Raw JSON</button>
            {status==="pending"&&<>
              <button type="button" disabled={busy} onClick={()=>{void decide(item,"approve");}}>Approve</button>
              <button type="button" disabled={busy} onClick={()=>{void decide(item,"reject");}}>Reject</button>
            </>}
            {status!=="deleted"&&<button type="button" className="master-template-delete" disabled={busy}
              onClick={()=>{void remove(item);}}>Delete</button>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
    {nextOffset!==null&&<button type="button" className="master-template-load" disabled={busy}
      onClick={()=>{void load(status,nextOffset,true);}}>Load More Templates</button>}
    {preview&&<section className="master-template-preview" aria-label="Generic template preview">
      <div><strong>{preview.bankName} · {formatType(preview)} · Layout {preview.requestedSlot??1}</strong>
        <button type="button" onClick={()=>setPreview(null)}>Close Preview</button></div>
      <p>Generic template fields only; no customer values are shown. Physical printer alignment must be checked separately.</p>
      <div className="master-template-paper" style={{width:"min(100%,640px)",aspectRatio:preview.widthMm+"/"+preview.heightMm}}>
        {preview.elements.filter(part=>Number(part.page||1)===1).slice(0,100).map((part,index)=>
          <span key={String(part.id||index)} style={{
            position:"absolute",left:(Number(part.x)/preview.widthMm*100)+"%",
            top:(Number(part.y)/preview.heightMm*100)+"%",
            width:(Number(part.width)/preview.widthMm*100)+"%",
            fontSize:10,overflow:"hidden",whiteSpace:"nowrap"
          }}>
            {["customer","bank","dotmatrix"].includes(String(part.origin))?
              "["+String(part.fieldKey||"data")+"]":String(part.label||"").slice(0,60)}
          </span>)}
      </div>
    </section>}
  </main>;
}
