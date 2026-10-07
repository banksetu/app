import { localDataFetch, getDataIdToken } from "./core/localData";
import { useCallback, useState, type FormEvent } from "react";
import { auth } from "./firebase";
import { getTenantApiUrl } from "./tenantApi";
import BankFormatPrint from "./BankFormatPrint";
import type { BankDocumentType } from "./bankDocumentPolicy";
import type { PassbookBankInfo } from "./AssamQuickPassbook";
type Match = { rowNumber: number; name?: string; accountNo?: string; enrolId?: string };
export default function CustomBankDocument({ formatType, bankInfo }: { formatType: BankDocumentType; bankInfo: PassbookBankInfo }) {
  const clientSearch = sessionStorage.getItem("bankSetuAccountRole") === "client_admin";
  const [templateLogo,setTemplateLogo]=useState("");
  const [overrides,setOverrides]=useState({dateOfBirth:"",religion:"",category:""});
  const [query,setQuery] = useState("");
  const [customer,setCustomer] = useState<Record<string,unknown> | null>(null);
  const [matches,setMatches] = useState<Match[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const onConfigured = useCallback(() => {}, []);
  const unionPassbook = /^(union bank of india|union bank|ubi)$/i.test((bankInfo.passbookBank || "").trim()) && formatType !== "accountOpening";
  const title = formatType === "accountOpening" ? "Account Opening PDF" : formatType === "quickPassbook" ? "Quick Passbook" : "Passbook Print";
  const request = async (body: Record<string,unknown>) => {
    const user=auth.currentUser, url=getTenantApiUrl();
    if (!user || !url) throw new Error("Connect this workspace's Google account first.");
    const response=await localDataFetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...body,idToken:await getDataIdToken(),includePhoto:true})});
    const result=await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "The customer could not be loaded.");
    return result;
  };
  const load = async (rowNumber?: number) => {
    setBusy(true); setError(""); setCustomer(null); setMatches([]);
    try {
      const result=await request(rowNumber ? {action:"getCustomerByRowNumber",rowNumber} : {action:"searchCustomer",query:query.trim()});
      if(result.multipleMatches && result.matches?.length) {setMatches(result.matches);return;}
      if(!result.customer) throw new Error("No customer found.");
      setOverrides({dateOfBirth:String(result.customer.dateOfBirth || result.customer.dob || ""),religion:String(result.customer.religion || ""),category:String(result.customer.category || "")});
      setCustomer({...result.customer,branchName:bankInfo.branchName,ifsc:bankInfo.ifsc});
    } catch(reason) {setError(reason instanceof Error ? reason.message : "Search failed.");}
    finally {setBusy(false);}
  };
  const search=(event:FormEvent)=>{event.preventDefault();if(query.trim())void load();};
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
    {customer && formatType === "accountOpening" && <label>Optional bank logo <input type="file" accept="image/png,image/jpeg" onChange={event=>{const file=event.target.files?.[0];if(!file||file.size>2*1024*1024)return;const reader=new FileReader();reader.onload=()=>setTemplateLogo(String(reader.result));reader.readAsDataURL(file);}} /></label>}
    {customer && formatType === "accountOpening" && <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:12}}>{(["dateOfBirth","religion","category"] as const).map(field=><label key={field}>{field === "dateOfBirth" ? "Date of Birth ✎" : field === "religion" ? "Religion ✎" : "Category ✎"}<input aria-label={`Edit ${field}`} type={field==="dateOfBirth"?"date":"text"} value={overrides[field]} onChange={event=>setOverrides(current=>({...current,[field]:event.target.value}))} /></label>)}<small>ये edits इस print preview के लिए हैं।</small></div>}
    {unionPassbook ? (customer ? <UnionPassbook customer={customer} bankInfo={bankInfo} /> : <p>Search a customer to preview the Union Bank passbook.</p>) : <BankFormatPrint formatType={formatType} bankName={bankInfo.passbookBank || ""} customer={customer ? {...customer,...overrides,templateLogo} : {}} onConfigured={onConfigured} allowPrint={!!customer} />}
  </section>;
}

function UnionPassbook({customer: c, bankInfo: b}: {customer: Record<string, unknown>; bankInfo: PassbookBankInfo}) {
  const value = (...keys: string[]) => keys.map(key => String(c[key] ?? "").trim()).find(Boolean) || "";
  const aadhaar = value("uidaiNo", "aadhaar", "aadhaarNo", "aadharNo");
  const address = value("fullAddress") || [value("address", "village"), value("postOffice"), value("pinCode")].filter(Boolean).join(", ");
  const opening = value("accountOpeningDate").replace(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/, "$3-$2-$1");
  return <div className="union-preview">
    <style>{`
      .union-preview{margin-top:24px;overflow-x:auto}
      .union-sheet{width:205mm;min-height:115mm;padding:8mm;box-sizing:border-box;margin:0 auto;background:#fff;color:#151515;box-shadow:0 4px 22px #0002;text-align:left;font:14px/1.5 Arial,sans-serif}
      .union-sheet *{box-sizing:border-box;text-align:left}
      .union-row{display:grid;grid-template-columns:64mm minmax(0,1fr);gap:4mm;padding:2mm 0;break-inside:avoid}
      .union-row strong{font: bold 15px/1.5 "Courier New",monospace;white-space:pre-wrap;overflow-wrap:anywhere;text-transform:uppercase}
      .union-sheet h2{font:700 18px Arial,sans-serif;color:#151515;margin:0 0 5mm;text-align:center}
      .union-address{min-height:18mm}
      .union-print{display:block;margin:18px auto;padding:12px 24px;background:#7662e9;color:white;border:0;border-radius:10px;font-weight:700}
      @media print{body *{visibility:hidden}.union-sheet,.union-sheet *{visibility:visible}.union-sheet{position:absolute;left:0;top:0;margin:0;box-shadow:none}.union-print{display:none}}
    `}</style>
    <article className="union-sheet" aria-label="Union Bank passbook customer details">
      <h2>Union Bank of India</h2>
      <div className="union-row"><span>शाखा / BRANCH</span><strong>{b.branchName || ""}</strong></div>
      <div className="union-row"><span>शाखा का पता / Branch Address</span><strong>{b.address || ""}</strong></div>
      <div className="union-row"><span>IFSC</span><strong>{b.ifsc || ""}</strong></div>
      <div className="union-row"><span>खाता क्र. / Account No.</span><strong>{value("accountNo")}</strong></div>
      <div className="union-row"><span>नाम / In the Name of</span><strong>{value("name")}{value("fatherName", "careOf") ? `\nC/O - ${value("fatherName", "careOf")}` : ""}</strong></div>
      <div className="union-row"><span>Aadhaar No.</span><strong>{aadhaar ? "XXXXXXXX" + aadhaar.replace(/\s/g, "").slice(-4) : ""}</strong></div>
      <div className="union-row"><span>पेशा / Occupation</span><strong>{value("occupation", "occupationType")}</strong></div>
      <div className="union-row union-address"><span>पता / Address</span><strong>{address}</strong></div>
      <div className="union-row"><span>खाता खोलने की तारीख / Date of Opening A/c</span><strong>{opening}</strong></div>
      <div className="union-row"><span>नामांकन / Nominee</span><strong>{value("nominee", "nomineeName")}</strong></div>
      <div className="union-row"><span>लेखाकार / Accountant</span><strong></strong></div>
    </article>
    <button className="union-print" type="button" onClick={()=>window.print()}>Print passbook</button>
  </div>;
}
