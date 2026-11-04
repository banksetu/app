import UnionAccountOpening from "./UnionAccountOpening";
import UnionPassbook from "./UnionPassbook";
import { localDataFetch, getDataIdToken } from "./core/localData";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {callBankSetuWorker} from "./workerApi";
import {templateCanRender,type ApprovedLayout} from "./layoutRuntimeValues";
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
  const searchEpoch=useRef(0);
  const onConfigured = useCallback(() => {}, []);
  const unionAof = /^(union bank of india|union bank|ubi)$/i.test((bankInfo.passbookBank || "").trim()) && formatType === "accountOpening";
  const unionPassbook = /^(union bank of india|union bank|ubi)$/i.test((bankInfo.passbookBank || "").trim()) && formatType !== "accountOpening";
  const title = formatType === "accountOpening" ? "Account Opening PDF" : formatType === "quickPassbook" ? "Quick Passbook" : "Passbook Print";
  const layoutMode=formatType==="accountOpening"?"accountOpening":"passbook";
  useEffect(()=>{
    let live=true;
    setActiveLayout(null);
    void (async()=>{
      try{
        const state=await callBankSetuWorker<{active:boolean;template:ApprovedLayout|null}>("/get-workspace-layout-selection",{mode:layoutMode});
        if(live && state.active && state.template && templateCanRender(state.template,bankInfo.passbookBank||"",layoutMode))
          setActiveLayout(state.template);
      }catch{/* Offline or no active custom template: keep the original bank print renderer unchanged. */}
    })();
    return()=>{live=false;};
  },[layoutMode,bankInfo.passbookBank]);
  // Changing the bank or signed-in workspace must immediately forget all
  // displayed customer data; late search responses cannot repopulate another
  // tenant's preview. This does not touch stored customer records.
  useEffect(()=>{
    const invalidate=()=>{
      searchEpoch.current+=1;
      setCustomer(null);setCustomerRow(null);setMatches([]);
      setBusy(false);setError("");setActiveLayout(null);
    };
    invalidate();
    window.addEventListener("banksetu-workspace-change",invalidate);
    return ()=>{
      searchEpoch.current+=1;
      window.removeEventListener("banksetu-workspace-change",invalidate);
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
  return <section className="custom-bank-document" style={{padding:24,background:"#f5f6fa",borderRadius:14,color:"#34344c"}}>
    <h1>{bankInfo.passbookBank} · {title}</h1>
    <p>This document uses your workspace's selected bank sample and customer records.</p>
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
    {activeLayout && customer ? <Suspense fallback={<p>Preparing approved custom layout…</p>}><WorkspaceTemplateDocument
      key={`${bankInfo.passbookBank}:${activeLayout.id}:${customerRow??""}:${customer.enrolId??customer.accountNo??""}`}
      template={activeLayout} bankName={bankInfo.passbookBank||""} customer={{...customer,...overrides}}
      bankInfo={bankInfo as Record<string,unknown>}
      output={formatType==="passbook"?"dotmatrix":"quick"} bankLogo={templateLogo||bankLogo}
      onPr2Complete={()=>{void completedPr2();}} /></Suspense>
    : unionAof ? (customer ? <UnionAccountOpening key={`${customer.enrolId}-${customer.accountNo}`} customer={{...customer,...overrides}} /> : <p>Search a customer to preview the Union Bank account opening form.</p>) : unionPassbook ? (customer ? <UnionPassbook customer={Object.fromEntries(Object.entries(customer).map(([key,value]) => [key,String(value ?? "")]))} bankInfo={bankInfo} formatType={formatType === "quickPassbook" ? "quickPassbook" : "passbook"} /> : <p>Search a customer to preview the Union Bank passbook.</p>) : <BankFormatPrint formatType={formatType} bankName={bankInfo.passbookBank || ""} customer={customer ? {...customer,...overrides,templateLogo} : {}} onConfigured={onConfigured} allowPrint={!!customer} />}
  </section>;
}
