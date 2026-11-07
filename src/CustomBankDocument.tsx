import UnionAccountOpening from "./UnionAccountOpening";
import UnionPassbook from "./UnionPassbook";
import { localDataFetch, getDataIdToken } from "./core/localData";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {callBankSetuWorker} from "./workerApi";
import {templateCanRender,type ApprovedLayout} from "./layoutRuntimeValues";
import {windowsLayoutEngineAvailable} from "./platform/layoutEngineGate";
const WorkspaceTemplateDocument=lazy(()=>import("./WorkspaceTemplateDocument"));
import { auth } from "./firebase";
import { getTenantApiUrl } from "./tenantApi";
import BankFormatPrint from "./BankFormatPrint";
import type { BankDocumentType } from "./bankDocumentPolicy";
import type { PassbookBankInfo } from "./AssamQuickPassbook";
type Match = { rowNumber: number; name?: string; accountNo?: string; enrolId?: string };
export default function CustomBankDocument({ formatType, bankInfo, bankLogo }: { formatType: BankDocumentType; bankInfo: PassbookBankInfo; bankLogo?:string }) {
  const clientSearch = sessionStorage.getItem("bankSetuAccountRole") === "client_admin";
  const [templateLogo,setTemplateLogo]=useState("");
  const [overrides,setOverrides]=useState({dateOfBirth:"",religion:"",category:""});
  const [query,setQuery] = useState("");
  const [customer,setCustomer] = useState<Record<string,unknown> | null>(null);
  const [customerRow,setCustomerRow] = useState<number|null>(null);
  const [matches,setMatches] = useState<Match[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [activeLayout,setActiveLayout]=useState<ApprovedLayout|null>(null);
  const [activeSlot,setActiveSlot]=useState(1);
  const searchEpoch=useRef(0);
  const [workspaceEpoch,setWorkspaceEpoch]=useState(0);
  const onConfigured = useCallback(() => {}, []);
  const unionAof = /^(union bank of india|union bank|ubi)$/i.test((bankInfo.passbookBank || "").trim()) && formatType === "accountOpening";
  const unionPassbook = /^(union bank of india|union bank|ubi)$/i.test((bankInfo.passbookBank || "").trim()) && formatType !== "accountOpening";
  const title = formatType === "accountOpening" ? "Account Opening PDF" : formatType === "quickPassbook" ? "Quick Passbook" : "Passbook Print";
  const layoutMode=formatType==="accountOpening"?"accountOpening":"passbook";
  const layoutOutput=formatType==="passbook"?"dotmatrix":"quick";
  useEffect(()=>{
    let live=true;
    setActiveLayout(null);
    // Android/Web must not fetch or activate the Windows-only layout engine.
    if(!windowsLayoutEngineAvailable())return ()=>{live=false;};
    void (async()=>{
      try{
        const state=await callBankSetuWorker<{active:boolean;template:ApprovedLayout|null}>("/get-workspace-layout-selection",{mode:layoutMode,output:layoutOutput,slot:layoutMode==="accountOpening"?1:activeSlot});
        if(live && state.active && state.template && templateCanRender(state.template,bankInfo.passbookBank||"",layoutMode))
          setActiveLayout(state.template);
      }catch{/* Offline or no active custom template: keep the original bank print renderer unchanged. */}
    })();
    return()=>{live=false;};
  },[layoutMode,layoutOutput,activeSlot,bankInfo.passbookBank,workspaceEpoch]);
  // Changing the bank or signed-in workspace must immediately forget all
  // displayed customer data; late search responses cannot repopulate another
  // tenant's preview. This does not touch stored customer records.
  useEffect(()=>{
    const invalidate=()=>{
      searchEpoch.current+=1;
      setCustomer(null);setCustomerRow(null);setMatches([]);
      setBusy(false);setError("");setActiveLayout(null);setActiveSlot(1);
    };
    invalidate();
    const onWorkspaceChange=()=>{
      invalidate();
      // Re-fetch activation in the new verified tenant and discard any
      // pending response from the previous tenant, even for the same bank.
      setWorkspaceEpoch(epoch=>epoch+1);
    };
    window.addEventListener("banksetu-workspace-change",onWorkspaceChange);
    return ()=>{
      searchEpoch.current+=1;
      window.removeEventListener("banksetu-workspace-change",onWorkspaceChange);
    };
  },[layoutMode,bankInfo.passbookBank]);
  const request = async (body: Record<string,unknown>) => {
    const user=auth.currentUser, url=getTenantApiUrl();
    if (!user || !url) throw new Error("Connect this workspace's Google account first.");
    const response=await localDataFetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...body,idToken:await getDataIdToken(),includePhoto:true})});
    const result=await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "The customer could not be loaded.");
    return result;
  };
  const load = async (rowNumber?: number) => {
    const epoch=++searchEpoch.current;
    setBusy(true); setError(""); setCustomer(null); setMatches([]);setCustomerRow(null);
    try {
      const result=await request(rowNumber ? {action:"getCustomerByRowNumber",rowNumber} : {action:"searchCustomer",query:query.trim()});
      if(epoch!==searchEpoch.current)return;
      if(result.multipleMatches && result.matches?.length) {setMatches(result.matches);return;}
      if(!result.customer) throw new Error("No customer found.");
      setOverrides({dateOfBirth:String(result.customer.dateOfBirth || result.customer.dob || ""),religion:String(result.customer.religion || ""),category:String(result.customer.category || "")});
      setCustomerRow(Number.isSafeInteger(Number(rowNumber||result.rowNumber||result.customer.rowNumber)) && Number(rowNumber||result.rowNumber||result.customer.rowNumber)>0
        ?Number(rowNumber||result.rowNumber||result.customer.rowNumber):null);
      setCustomer({...result.customer,branchName:bankInfo.branchName,ifsc:bankInfo.ifsc});
    } catch(reason) {if(epoch===searchEpoch.current)setError(reason instanceof Error ? reason.message : "Search failed.");}
    finally {if(epoch===searchEpoch.current)setBusy(false);}
  };
  const downloadRawLayout=async()=>{
    if(!windowsLayoutEngineAvailable())return;
    setError("");
    try{
      const bankName=(bankInfo.passbookBank||"").trim();
      if(!bankName)throw Error("Choose your configured bank before exporting a layout.");
      const {readLocalLayouts,currentLayoutScope}=await import("./layoutLocalStore.ts");
      const {validatePersistedLayoutDraft}=await import("./layoutDraftValidation.ts");
      const scope=currentLayoutScope().scope;
      const slots=await readLocalLayouts(bankName,layoutMode);
      const slotId="layout-"+(activeSlot+(layoutOutput==="dotmatrix"?3:0));
      const local=slots.find(item=>item.slotId===slotId)?.draft;
      let raw:Record<string,unknown>|null=null;
      if(validatePersistedLayoutDraft(local,layoutMode,bankName)){
        raw=structuredClone(local) as Record<string,unknown>;
      }else if(activeLayout&&templateCanRender(activeLayout,bankName,layoutMode)){
        raw={
          version:1,mode:layoutMode,bankName,
          pageCount:activeLayout.pageCount??1,
          widthMm:activeLayout.widthMm,heightMm:activeLayout.heightMm,
          foldMm:activeLayout.foldMm,printStartMm:activeLayout.printStartMm,
          pageSetup:activeLayout.pageSetup,
          elements:activeLayout.elements.map(element=>({...element,value:""}))
        };
      }
      if(!raw||!validatePersistedLayoutDraft(raw,layoutMode,bankName))
        throw Error("This slot has no compatible saved editable template. Save the layout in Designer first.");
      raw.requestedOutput=layoutOutput;raw.requestedSlot=activeSlot;
      // Never put resolved customer names, account numbers or customer photos into a shared backup.
      if(Array.isArray(raw.elements))raw.elements=raw.elements.map(part=>{
        const element=part as Record<string,unknown>;
        return ["customer","bank","dotmatrix"].includes(String(element.origin||""))
          ? {...element,value:"",imageData:undefined}:element;
      });
      if(currentLayoutScope().scope!==scope)
        throw Error("The signed-in workspace changed. Export cancelled.");
      const filename=(bankName.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,48)||"bank")+
        "-"+layoutOutput+"-layout-"+activeSlot+".json";
      const blob=new Blob([JSON.stringify(raw,null,2)],{type:"application/json"});
      if(blob.size>750*1024)throw Error("Editable layout is larger than the 750 KB restore limit.");
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");link.href=url;link.download=filename;link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),500);
    }catch(reason){setError(reason instanceof Error?reason.message:"Unable to download editable layout.");}
  };
  const search=(event:FormEvent)=>{event.preventDefault();if(query.trim())void load();};
  const completedPr2=async()=>{
    if(!customerRow){setError("The printer acknowledged printing, but this customer has no verified row number. Passbook status was NOT changed. Do not print again solely to update status.");return;}
    try{
      await request({action:"markPassbookPrinted",rowNumber:customerRow});
      setCustomer(current=>current?{...current,passbookStatus:"Printed"}:current);
    }catch(error){
      setError("PR2 device acknowledged printing, but passbook status could not be saved. Do not print again just to update it. "+(error instanceof Error?error.message:""));
    }
  };
  return <section className="custom-bank-document" data-print-root="active" data-print-profile={formatType === "quickPassbook" ? "safe" : "exact"} style={{padding:24,background:"#f5f6fa",borderRadius:14,color:"#34344c"}}>
    <h1>{bankInfo.passbookBank} · {title}</h1>
    <p>This document uses your workspace's selected bank sample and customer records.</p>
    {windowsLayoutEngineAvailable()&&layoutMode==="passbook"&&<div className="banksetu-layout-slot-actions" style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:12}}>
      <label style={{display:"inline-flex",alignItems:"center",gap:9}}>
        {layoutOutput==="dotmatrix"?"PR2 Passbook Print Layout":"Quick Passbook Layout"}
        <select value={activeSlot} aria-label="Approved passbook layout slot" onChange={event=>setActiveSlot(Number(event.target.value))}
          style={{minHeight:36,borderRadius:7,padding:"6px 10px"}}>
          {[1,2,3].map(n=><option key={n} value={n}>Layout {n}</option>)}
        </select>
      </label>
      <button type="button" onClick={()=>{void downloadRawLayout();}}>Download Raw Layout (.json)</button>
      <small>Reopen it using Designer → File → Restore Editable Backup.</small>
    </div>}
    {clientSearch ? <form className="client-document-search" onSubmit={search}>
      <label htmlFor="client-document-query">UNIVERSAL CUSTOMER SEARCH</label>
      <div><input id="client-document-query" placeholder="Account No. / Customer ID / Aadhaar / Mobile / AOF No. / Name" value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off" />
      <button type="submit" disabled={busy || !query.trim()}>{busy ? "Searching…" : "Search"}</button></div>
    </form> : <form onSubmit={search} style={{display:"flex",gap:12}}><input aria-label="Search customer" placeholder="Account / Customer ID / Mobile / Name" value={query} onChange={e=>setQuery(e.target.value)} style={{flex:1,padding:12}} /><button disabled={busy || !query.trim()}>{busy ? "Loading…" : "Search"}</button></form>}
    {clientSearch && <style>{`
      .client-document-search{max-width:1100px;margin:20px auto 22px;padding:20px;border-radius:18px;background:#fff;border:1px solid #e5e3ef;box-shadow:0 12px 30px rgba(47,38,82,.07)}
      .client-document-search label{display:block;margin-bottom:9px;font-size:12px;font-weight:900;letter-spacing:1.2px;color:#555268;text-align:center}
      .client-document-search>div{display:flex;gap:10px}
      .client-document-search input{flex:1;min-width:0;height:48px;padding:0 16px;border-radius:12px;border:1px solid #dedde8;background:#f8f8fc;color:#34344c;font-size:15px;outline:none}
      .client-document-search input:focus{border-color:#8a75ef;box-shadow:0 0 0 3px rgba(117,98,234,.1)}
      .client-document-search button{min-width:130px;border:0;border-radius:12px;padding:0 20px;font-weight:900;cursor:pointer;color:white;background:linear-gradient(135deg,#7662e9,#9178f5);box-shadow:0 7px 16px rgba(117,98,234,.2)}
      .client-document-search button:disabled{opacity:.6;cursor:default}
      @media(max-width:560px){.client-document-search{padding:14px}.client-document-search>div{flex-direction:column}.client-document-search input{flex:auto;width:100%;box-sizing:border-box}.client-document-search button{min-height:48px;width:100%}}
      @media print{.client-document-search{display:none}}
    `}</style>}
    {error && <p role="alert">{error}</p>}
    {matches.map(match=><button type="button" key={match.rowNumber} disabled={busy} onClick={()=>void load(match.rowNumber)}>{match.name} · {match.accountNo} · {match.enrolId}</button>)}
    {customer && !unionAof && formatType === "accountOpening" && <label>Optional bank logo <input type="file" accept="image/png,image/jpeg" onChange={event=>{const file=event.target.files?.[0];if(!file||file.size>2*1024*1024)return;const reader=new FileReader();reader.onload=()=>setTemplateLogo(String(reader.result));reader.readAsDataURL(file);}} /></label>}
    {customer && formatType === "accountOpening" && <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:12}}>{(["dateOfBirth","religion","category"] as const).map(field=><label key={field}>{field === "dateOfBirth" ? "Date of Birth ✎" : field === "religion" ? "Religion ✎" : "Category ✎"}<input aria-label={`Edit ${field}`} type={field==="dateOfBirth"?"date":"text"} value={overrides[field]} onChange={event=>setOverrides(current=>({...current,[field]:event.target.value}))} /></label>)}<small>ये edits इस print preview के लिए हैं।</small></div>}
    {windowsLayoutEngineAvailable() && activeLayout && customer ? <Suspense fallback={<p>Preparing approved custom layout…</p>}><WorkspaceTemplateDocument
      key={`${bankInfo.passbookBank}:${activeLayout.id}:${customerRow??""}:${customer.enrolId??customer.accountNo??""}`}
      template={activeLayout} bankName={bankInfo.passbookBank||""} customer={{...customer,...overrides}}
      bankInfo={bankInfo as Record<string,unknown>}
      output={formatType==="passbook"?"dotmatrix":"quick"} bankLogo={templateLogo||bankLogo}
      onPr2Complete={()=>{void completedPr2();}} /></Suspense>
    : unionAof ? (customer ? <UnionAccountOpening key={`${customer.enrolId}-${customer.accountNo}`} customer={{...customer,...overrides}} /> : <p>Search a customer to preview the Union Bank account opening form.</p>) : unionPassbook ? (customer ? <UnionPassbook customer={Object.fromEntries(Object.entries(customer).map(([key,value]) => [key,String(value ?? "")]))} bankInfo={bankInfo} formatType={formatType === "quickPassbook" ? "quickPassbook" : "passbook"} /> : <p>Search a customer to preview the Union Bank passbook.</p>) : <BankFormatPrint formatType={formatType} bankName={bankInfo.passbookBank || ""} customer={customer ? {...customer,...overrides,templateLogo} : {}} onConfigured={onConfigured} allowPrint={!!customer} />}
  </section>;
}
