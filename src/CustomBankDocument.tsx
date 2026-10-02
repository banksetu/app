import { useCallback, useState, type FormEvent } from "react";
import { auth } from "./firebase";
import { getTenantApiUrl } from "./tenantApi";
import BankFormatPrint from "./BankFormatPrint";
import type { BankDocumentType } from "./bankDocumentPolicy";
import type { PassbookBankInfo } from "./AssamQuickPassbook";
type Match = { rowNumber: number; name?: string; accountNo?: string; enrolId?: string };
export default function CustomBankDocument({ formatType, bankInfo }: { formatType: BankDocumentType; bankInfo: PassbookBankInfo }) {
  const [query,setQuery] = useState("");
  const [customer,setCustomer] = useState<Record<string,unknown> | null>(null);
  const [matches,setMatches] = useState<Match[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const onConfigured = useCallback(() => {}, []);
  const title = formatType === "accountOpening" ? "Account Opening PDF" : formatType === "quickPassbook" ? "Quick Passbook" : "Passbook Print";
  const request = async (body: Record<string,unknown>) => {
    const user=auth.currentUser, url=getTenantApiUrl();
    if (!user || !url) throw new Error("Connect this workspace's Google account first.");
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...body,idToken:await user.getIdToken(),includePhoto:true})});
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
      setCustomer({...result.customer,branchName:bankInfo.branchName,address:result.customer.fullAddress || result.customer.address,ifsc:bankInfo.ifsc});
    } catch(reason) {setError(reason instanceof Error ? reason.message : "Search failed.");}
    finally {setBusy(false);}
  };
  const search=(event:FormEvent)=>{event.preventDefault();if(query.trim())void load();};
  return <section className="custom-bank-document" style={{padding:24,background:"#f5f6fa",borderRadius:14,color:"#34344c"}}>
    <h1>{bankInfo.passbookBank} · {title}</h1>
    <p>This document uses your workspace's selected bank sample and customer records.</p>
    <form onSubmit={search} style={{display:"flex",gap:12}}><input aria-label="Search customer" placeholder="Account / Customer ID / Mobile / Name" value={query} onChange={e=>setQuery(e.target.value)} style={{flex:1,padding:12}} /><button disabled={busy || !query.trim()}>{busy ? "Loading…" : "Search"}</button></form>
    {error && <p role="alert">{error}</p>}
    {matches.map(match=><button type="button" key={match.rowNumber} disabled={busy} onClick={()=>void load(match.rowNumber)}>{match.name} · {match.accountNo} · {match.enrolId}</button>)}
    <BankFormatPrint formatType={formatType} bankName={bankInfo.passbookBank || ""} customer={customer || {}} onConfigured={onConfigured} allowPrint={!!customer} />
  </section>;
}
