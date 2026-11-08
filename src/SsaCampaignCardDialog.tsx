import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { customerListScope } from "./customerListCache";
import { SSA_CARD_TITLES, ssaCardRows, type SsaCardKind } from "./core/ssaCardDetails";
import type { SsaCampaignEntry } from "./core/ssaCampaign";
import "./SsaCampaignCardDialog.css";

// Reuse the exact customer preview, including its Print / Share / Close,
// entitlement checks, and the authorized customer detail lookup.
const AllCustomerData = lazy(() => import("./AllCustomerData"));
const PAGE_SIZE=100;

export default function SsaCampaignCardDialog({
  kind, entries, hasMore, onClose, onPdf
}: {
  kind:SsaCardKind;
  entries:SsaCampaignEntry[];
  hasMore:boolean;
  onClose:()=>void;
  onPdf:(entry:SsaCampaignEntry)=>Promise<void>;
}) {
  const [workspaceScope]=useState(()=>customerListScope());
  const [search,setSearch]=useState("");
  const [limit,setLimit]=useState(PAGE_SIZE);
  const [preview,setPreview]=useState<SsaCampaignEntry|null>(null);
  const [message,setMessage]=useState("");
  const [pdfBusy,setPdfBusy]=useState("");
  const rows=useMemo(()=>ssaCardRows(entries,kind),[entries,kind]);
  const shown=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase();
    return query?rows.filter(item=>[item.name,item.accountNo,item.customerId,item.entryDate]
      .some(value=>value.toLocaleLowerCase().includes(query))):rows;
  },[rows,search]);
  const page=shown.slice(0,limit);
  const openPreview=(entry:SsaCampaignEntry)=>{
    if(customerListScope()!==workspaceScope){
      setMessage("The customer workspace changed. Reopen SSA Campaign before viewing a customer.");return;
    }
    if(!entry.customerRecordId){
      setMessage("This entry does not contain a verified customer identity. Sync before opening its preview.");return;
    }
    setMessage("");
    setPreview(entry);
  };
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&!preview&&!pdfBusy)onClose();
    };
    const onWorkspaceChange=()=>{
      if(customerListScope()!==workspaceScope){setPreview(null);onClose();}
    };
    window.addEventListener("keydown",onKey);
    window.addEventListener("banksetu-workspace-change",onWorkspaceChange);
    return()=>{
      window.removeEventListener("keydown",onKey);
      window.removeEventListener("banksetu-workspace-change",onWorkspaceChange);
    };
  },[onClose,preview,pdfBusy,workspaceScope]);
  const exportEntry=async(entry:SsaCampaignEntry)=>{
    if(pdfBusy)return;
    if(customerListScope()!==workspaceScope){
      setMessage("Workspace changed. Reopen this report.");return;
    }
    setPdfBusy(entry.entryId);
    setMessage("");
    try {await onPdf(entry);}
    catch(error){setMessage(error instanceof Error?error.message:"Individual SSA PDF could not be prepared.");}
    finally{setPdfBusy("");}
  };
  return createPortal(<>
    <div className="ssa-card-overlay" role="presentation"
      onMouseDown={event=>{if(event.target===event.currentTarget&&!preview&&!pdfBusy)onClose();}}>
      <section className="ssa-card-dialog" role="dialog" aria-modal="true"
        aria-label={SSA_CARD_TITLES[kind]+" customer list"}>
        <header className="ssa-card-heading">
          <div><h2>{SSA_CARD_TITLES[kind]} — Customer List</h2>
            <p>Click a customer name or account number to open the existing customer preview.</p></div>
          <button type="button" onClick={onClose} disabled={!!pdfBusy} aria-label="Close SSA customer list">×</button>
        </header>
        <div className="ssa-card-summary">
          <div><small>{SSA_CARD_TITLES[kind]}</small><strong>{rows.length}</strong></div>
          <label>Search customer or account
            <input type="search" value={search} aria-label="Search SSA card customer list"
              placeholder="Name, account number, customer ID…"
              onChange={event=>{setSearch(event.target.value);setLimit(PAGE_SIZE);}}/>
          </label>
        </div>
        {hasMore&&<p className="ssa-card-warning" role="status">
          Google Sheet reports additional older entries. The card and popup currently show only loaded SSA entries.
        </p>}
        {message&&<p className="ssa-card-warning" role="alert">{message}</p>}
        <div className="ssa-card-table-wrap">
          <table>
            <thead><tr><th>#</th><th>Customer Name</th><th>Account Number</th><th>Entry Date</th>
              {kind==="total"?<>
                <th>APY</th><th>PMJJBY</th><th>PMSBY</th>
              </>:<th>{kind.toUpperCase()}</th>}
              <th>PDF</th>
            </tr></thead>
            <tbody>
              {page.map((entry,index)=><tr key={entry.entryId}>
                <td data-label="#">{index+1}</td>
                <td data-label="Customer Name"><button type="button" className="ssa-card-customer-link"
                  onClick={()=>openPreview(entry)}>{entry.name||"Customer"}</button></td>
                <td data-label="Account Number"><button type="button" className="ssa-card-customer-link ssa-card-account"
                  onClick={()=>openPreview(entry)}>{entry.accountNo}</button></td>
                <td data-label="Entry Date">{entry.entryDate}</td>
                {kind==="total"?<>
                  <td data-label="APY">{entry.apy?"Yes":"—"}</td>
                  <td data-label="PMJJBY">{entry.pmjjby?"Yes":"—"}</td>
                  <td data-label="PMSBY">{entry.pmsby?"Yes":"—"}</td>
                </>:<td data-label={kind.toUpperCase()} className="ssa-card-yes">Yes</td>}
                <td data-label="PDF"><button type="button" className="ssa-card-pdf"
                  disabled={!!pdfBusy} aria-label={"Download SSA PDF for account "+entry.accountNo}
                  onClick={()=>void exportEntry(entry)}>
                  {pdfBusy===entry.entryId?"Preparing…":"PDF"}
                </button></td>
              </tr>)}
              {!page.length&&<tr><td colSpan={kind==="total"?8:6}
                className="ssa-card-empty">No matching SSA entries for this card and selected period.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="ssa-card-footer">
          <span>Showing {page.length} of {shown.length} matching entries.</span>
          {shown.length>limit&&<button type="button" onClick={()=>setLimit(value=>value+PAGE_SIZE)}>
            Load More</button>}
          <button type="button" onClick={onClose} disabled={!!pdfBusy}>Close</button>
        </footer>
      </section>
    </div>
    {preview&&<Suspense fallback={<p className="ssa-card-preview-wait" role="status">Opening customer preview…</p>}>
      <AllCustomerData
        key={preview.customerRecordId}
        previewCustomer={{
          recordId:preview.customerRecordId,
          accountNo:preview.accountNo,
          enrolId:preview.customerId,
          name:preview.name
        }}
        onPreviewClose={()=>setPreview(null)}
      />
    </Suspense>}
  </>,document.body);
}
