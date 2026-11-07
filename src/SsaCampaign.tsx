import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { auth } from "./firebase";
import { getActiveLocalCustomers, localDataFetch } from "./core/localData";
import { localSsaCampaignEntries, queueSsaCampaignEntry, refreshSsaCampaignEntries, type SsaCampaignEntry } from "./core/ssaCampaign";
import { buildCustomerXlsx, saveCustomerXlsx } from "./exportXlsx";
import { flushSync } from "react-dom";
import SsaCampaignReportDialog from "./SsaCampaignReportDialog";
import { selectSsaReportEntries, ssaReportCounts, type SsaReportKind, type SsaReportSelection } from "./core/ssaReportSelection";
import "./SsaCampaign.css";

type CustomerRef={recordId:string;enrolId:string;accountNo:string;name:string;contact:string};
type Preset="month"|"today"|"week"|"year"|"all"|"custom";
const fmt=(d:Date)=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today=()=>fmt(new Date());
const monthStart=()=>{const d=new Date();return fmt(new Date(d.getFullYear(),d.getMonth(),1));};
const lower=(v:unknown)=>String(v??"").trim().toLowerCase();
const validId=(v:string)=>/^[a-f0-9-]{36}$/i.test(v);
const asCustomer=(v:Record<string,unknown>):CustomerRef=>({
  recordId:String(v.recordId||v.customerRecordId||""),enrolId:String(v.enrolId||v.customerId||""),
  accountNo:String(v.accountNo||""),name:String(v.name||""),contact:String(v.contact||"")
});
function dateRange(preset:Preset,from:string,to:string):[string,string]{
  const d=new Date(),end=today();
  if(preset==="today")return [end,end];
  if(preset==="month")return [monthStart(),end];
  if(preset==="year")return [d.getFullYear()+"-01-01",end];
  if(preset==="week")return [fmt(new Date(d.getFullYear(),d.getMonth(),d.getDate()-6)),end];
  if(preset==="all")return ["0000-01-01","9999-12-31"];
  return [from||"0000-01-01",to||"9999-12-31"];
}
const reportRows=(list:SsaCampaignEntry[])=>list.map(e=>({
  "Entry Date":e.entryDate,"Customer Name":e.name,"Customer ID":e.customerId,
  "Account Number":e.accountNo,APY:e.apy?"Yes":"No",
  PMJJBY:e.pmjjby?"Yes":"No",PMSBY:e.pmsby?"Yes":"No",
  "Sync Status":e.syncError?"Needs review":e.pending?"Pending":"Synced"
}));
export default function SsaCampaign(){
  const [entries,setEntries]=useState<SsaCampaignEntry[]>([]);
  const [hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("Search for a customer, select schemes and save. Edit existing entries in the list below.");
  const [query,setQuery]=useState(""),[matches,setMatches]=useState<CustomerRef[]>([]);
  const [customer,setCustomer]=useState<CustomerRef|null>(null),[editId,setEditId]=useState("");
  const [entryDate,setEntryDate]=useState(today),[apy,setApy]=useState(false);
  const [pmjjby,setPmjjby]=useState(false),[pmsby,setPmsby]=useState(false);
  const [preset,setPreset]=useState<Preset>("month"),[from,setFrom]=useState(monthStart),[to,setTo]=useState(today);
  const [filter,setFilter]=useState(""),[page,setPage]=useState(1);
  const [reportKind,setReportKind]=useState<SsaReportKind|null>(null);
  const [printSelection,setPrintSelection]=useState<{rows:SsaCampaignEntry[];description:string}|null>(null);
  const reload=useCallback(async(remote:boolean)=>{
    try {
      const result=remote?await refreshSsaCampaignEntries():{entries:await localSsaCampaignEntries(),hasMore:false};
      setEntries(result.entries);if(remote){setHasMore(result.hasMore);setError("");}
    }catch(e){setError(e instanceof Error?e.message:"SSA Campaign entries are unavailable.");
      try{setEntries(await localSsaCampaignEntries());}catch{/* Workspace is not verified. */}
    }
  },[]);
  useEffect(()=>{let active=true;const onSync=()=>{if(active)void reload(false);};
    const timer=window.setTimeout(()=>{if(active)void reload(true);},0);
    window.addEventListener("banksetu-sync-change",onSync);
    return()=>{active=false;window.clearTimeout(timer);window.removeEventListener("banksetu-sync-change",onSync);};
  },[reload]);
  const [start,end]=dateRange(preset,from,to);
  const filtered=useMemo(()=>entries.filter(e=>e.entryDate>=start&&e.entryDate<=end&&
    (!filter||[e.name,e.accountNo,e.customerId,e.entryDate].some(v=>lower(v).includes(lower(filter))))),
  [entries,start,end,filter]);
  const count={total:filtered.length,apy:filtered.filter(e=>e.apy).length,
    pmjjby:filtered.filter(e=>e.pmjjby).length,pmsby:filtered.filter(e=>e.pmsby).length};
  const totalPages=Math.max(1,Math.ceil(filtered.length/8)),currentPage=Math.min(page,totalPages);
  const visible=filtered.slice((currentPage-1)*8,currentPage*8);
  const sameMonth=customer?entries.find(e=>e.accountNo===customer.accountNo&&e.period===entryDate.slice(0,7)):undefined;
  const activeId=editId&&entries.some(e=>e.entryId===editId)?editId:sameMonth?.entryId||"";
  const choose=(selected:CustomerRef,record?:SsaCampaignEntry)=>{
    const existing=record||entries.find(e=>e.accountNo===selected.accountNo&&e.period===entryDate.slice(0,7));
    setCustomer(selected);setMatches([]);setQuery(selected.accountNo);setEditId(existing?.entryId||"");
    setApy(existing?.apy||false);setPmjjby(existing?.pmjjby||false);setPmsby(existing?.pmsby||false);
    if(existing)setEntryDate(existing.entryDate);
    setError("");setNotice(existing?"Existing entry selected. Change schemes and click Update Entry.":"Customer selected. Choose schemes and click Save New Entry.");
  };
  const search=async(event?:FormEvent)=>{
    event?.preventDefault();if(!query.trim()){setError("Enter Account Number, Customer ID, mobile or name.");return;}
    setBusy(true);setError("");setMatches([]);
    try {
      const local=await getActiveLocalCustomers();
      let found=local.filter(row=>[row.accountNo,row.enrolId,row.contact,row.name].some(v=>lower(v).includes(lower(query))))
        .slice(0,25).map(row=>asCustomer(row as Record<string,unknown>));
      if(!found.length&&navigator.onLine&&sessionStorage.getItem("bankSetuConnectionMode")!=="demo"){
        const url=sessionStorage.getItem("bankSetuBridgeUrl"),token=await auth.currentUser?.getIdToken();
        if(url&&token){
          const response=await localDataFetch(url,{method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},
            body:JSON.stringify({action:"searchCustomer",query:query.trim(),connectionId:sessionStorage.getItem("bankSetuConnectionId"),idToken:token})});
          const data=await response.json();
          const rows=Array.isArray(data.matches)?data.matches:data.customer?[data.customer]:[];
          found=rows.map((row:Record<string,unknown>)=>asCustomer(row));
        }
      }
      const items=[...new Map(found.filter(item=>validId(item.recordId)&&item.accountNo).map(item=>[item.recordId,item])).values()];
      if(items.length===1)choose(items[0]);
      else if(items.length)setMatches(items);
      else{setCustomer(null);setEditId("");setNotice("No synced customer found. Sync customer data and search again.");}
    }catch(e){setError(e instanceof Error?e.message:"Customer search failed.");}
    finally{setBusy(false);}
  };
  const save=async(mode:"create"|"update")=>{
    if(!customer){setError("Select a customer first.");return;}
    if(mode==="create"&&activeId){setError("Entry already exists for this month. Use Update Entry.");return;}
    if(mode==="update"&&!activeId){setError("No existing entry found. Use Save New Entry.");return;}
    setBusy(true);setError("");
    try {
      const entry=await queueSsaCampaignEntry({
        entryDate,customerRecordId:customer.recordId,customerId:customer.enrolId,
        accountNo:customer.accountNo,name:customer.name,apy,pmjjby,pmsby
      },mode,activeId||undefined);
      setEditId(entry.entryId);
      setNotice(sessionStorage.getItem("bankSetuConnectionMode")==="demo"?
        "Demo entry saved locally. No live Google Sheet was changed.":
        "Entry saved locally and queued in the existing Smart Sync Engine. Google confirmation appears in Sync & Backup.");
      await reload(false);
    }catch(e){setError(e instanceof Error?e.message:"SSA entry could not be saved.");}
    finally{setBusy(false);}
  };
  const report=async(kind:SsaReportKind,selection:SsaReportSelection):Promise<boolean>=>{
    setError("");
    try {
      const selected=selectSsaReportEntries(entries,selection);
      if(!selected.rows.length)throw new Error("No SSA Campaign entries match the selected customer and dates.");
      if(hasMore&&(selection.period==="all"||selection.audience==="all"))
        throw new Error("Load the remaining Google Sheet entries before exporting all records.");
      const counts=ssaReportCounts(selected.rows);
      const fileStem="BankSetu-SSA-Campaign-"+today();
      if(kind==="print"){
        // Commit the selected rows to the real print tree before opening the
        // existing browser/Windows print dialog. Never print the dashboard filter.
        flushSync(()=>{setPrintSelection(selected);setReportKind(null);});
        const cleanup=()=>document.body.classList.remove("ssa-campaign-printing");
        document.body.classList.add("ssa-campaign-printing");
        window.addEventListener("afterprint",cleanup,{once:true});
        try { window.print(); }
        finally { window.setTimeout(cleanup,2500); }
        setNotice("A4 print preview opened with "+selected.rows.length+" selected entries.");
        return true;
      }
      setLoading(true);
      if(kind==="excel"){
        const blob=await buildCustomerXlsx(reportRows(selected.rows),{
          allFields:true,photos:false,autoResize:true,sheetName:"SSA Campaign",progress:()=>{}
        });
        await saveCustomerXlsx(blob,fileStem+".xlsx");
        setNotice("Excel generated for "+selected.rows.length+" selected entries.");
      }else{
        const {jsPDF}=await import("jspdf");
        const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
        const x=[11,40,123,181,207,239];
        const headings=["Entry Date","Customer Name","Account Number","APY","PMJJBY","PMSBY"];
        const maxY=185;
        let y=0;
        const drawHeading=()=>{
          pdf.setTextColor(25,44,77);
          pdf.setFont("helvetica","bold");pdf.setFontSize(15);
          pdf.text("BANK SETU | SSA Campaign Report",11,15);
          pdf.setFontSize(9);pdf.setFont("helvetica","normal");
          pdf.text(selected.description,11,22,{maxWidth:275});
          pdf.text("Entries: "+counts.entries+" | APY: "+counts.apy+
            " | PMJJBY: "+counts.pmjjby+" | PMSBY: "+counts.pmsby,11,28);
          y=36;pdf.setFont("helvetica","bold");pdf.setFontSize(9);
          headings.forEach((heading,i)=>pdf.text(heading,x[i],y));
          pdf.line(11,y+2,285,y+2);y+=8;
          pdf.setFont("helvetica","normal");
        };
        drawHeading();
        selected.rows.forEach(entry=>{
          const nameLines=pdf.splitTextToSize(entry.name||"",80) as string[];
          const accountLines=pdf.splitTextToSize(entry.accountNo||"",52) as string[];
          const lines=Math.max(1,nameLines.length,accountLines.length);
          const height=Math.max(7,lines*4.2+3);
          if(y+height>maxY){pdf.addPage();drawHeading();}
          pdf.setFontSize(9);
          pdf.text(entry.entryDate,x[0],y);
          pdf.text(nameLines,x[1],y);
          pdf.text(accountLines,x[2],y);
          pdf.text(entry.apy?"Yes":"No",x[3],y);
          pdf.text(entry.pmjjby?"Yes":"No",x[4],y);
          pdf.text(entry.pmsby?"Yes":"No",x[5],y);
          y+=height;
          pdf.setDrawColor(210,220,230);pdf.line(11,y-2,285,y-2);
        });
        const pageCount=pdf.getNumberOfPages();
        for(let page=1;page<=pageCount;page++){
          pdf.setPage(page);pdf.setFontSize(8);
          pdf.text("Page "+page+" / "+pageCount,276,200,{align:"right"});
        }
        const blob=pdf.output("blob");
        if(kind==="share"){
          const shareFile=new File([blob],fileStem+".pdf",{type:"application/pdf"});
          if(typeof navigator.share==="function" &&
             typeof navigator.canShare==="function" && navigator.canShare({files:[shareFile]})){
            await navigator.share({title:"BANK SETU SSA Campaign",files:[shareFile]});
            setNotice("Selected SSA Campaign PDF shared.");
          }else{
            const url=URL.createObjectURL(blob);
            try{
              const anchor=document.createElement("a");anchor.href=url;anchor.download=shareFile.name;
              document.body.append(anchor);anchor.click();anchor.remove();
            }finally{window.setTimeout(()=>URL.revokeObjectURL(url),15000);}
            setNotice("Direct PDF file sharing is unavailable here. The selected PDF was downloaded for manual sharing.");
          }
        }else{
          pdf.save(fileStem+".pdf");
          setNotice("PDF generated for "+selected.rows.length+" selected entries.");
        }
      }
      setReportKind(null);
      return true;
    }catch(e){
      if(e instanceof Error&&e.name==="AbortError")return false;
      setError(e instanceof Error?e.message:"Could not generate SSA report.");
      return false;
    }finally{setLoading(false);}
  };
  return <div className="ssa-campaign">
    {reportKind&&<SsaCampaignReportDialog kind={reportKind} entries={entries} hasMore={hasMore}
      onClose={()=>setReportKind(null)} onGenerate={selection=>report(reportKind,selection)} />}
    <header className="ssa-banner">
      <h1><span>◎</span> SSA Campaign</h1>
      <div className="ssa-banner-controls">
        <select aria-label="Report period" value={preset} onChange={e=>{setPreset(e.target.value as Preset);setPage(1);}}>
          <option value="month">This Month</option><option value="today">Today</option>
          <option value="week">Last 7 Days</option><option value="year">This Year</option>
          <option value="all">All Dates</option><option value="custom">Custom Range</option>
        </select>
        <label>From <input type="date" value={preset==="custom"?from:start==="0000-01-01"?"":start}
          onChange={e=>{setFrom(e.target.value);setPreset("custom");setPage(1);}}/></label>
        <label>To <input type="date" value={preset==="custom"?to:end==="9999-12-31"?"":end}
          onChange={e=>{setTo(e.target.value);setPreset("custom");setPage(1);}}/></label>
        <button type="button" title="Refresh from Google Sheet" disabled={loading} onClick={()=>{setLoading(true);void reload(true).finally(()=>setLoading(false));}}>↻</button>
      </div>
    </header>
    <section className="ssa-kpis" aria-label="SSA Campaign totals">
      <div className="ssa-kpi blue"><span>▤</span><div><b>Total Entry</b><strong>{count.total}</strong></div></div>
      <div className="ssa-kpi green"><span>●</span><div><b>Total APY</b><strong>{count.apy}</strong></div></div>
      <div className="ssa-kpi orange"><span>✚</span><div><b>Total PMJJBY</b><strong>{count.pmjjby}</strong></div></div>
      <div className="ssa-kpi purple"><span>☂</span><div><b>Total PMSBY</b><strong>{count.pmsby}</strong></div></div>
    </section>
    <div className="ssa-main">
      <section className="ssa-panel ssa-editor" aria-label="Add or update SSA Campaign entry">
        <h2>♧ Add / Update SSA Entry</h2>
        <form className="ssa-search" onSubmit={e=>void search(e)}>
          <input aria-label="Search customer" placeholder="Search Account Number, Customer ID, Mobile or Name" value={query} onChange={e=>setQuery(e.target.value)}/>
          <button disabled={busy} type="submit">⌕ Search</button>
        </form>
        {matches.length>0&&<div className="ssa-matches" role="listbox" aria-label="Customer matches">
          {matches.map(item=><button type="button" key={item.recordId} onClick={()=>choose(item)}>
            <b>{item.name}</b><small>{item.accountNo} · {item.enrolId}</small>
          </button>)}
        </div>}
        <div className="ssa-customer">
          <span className="ssa-customer-icon">●</span>
          <div><small>Customer Name</small><b>{customer?.name||"Select a customer"}</b></div>
          <div><small>Account Number</small><b>{customer?.accountNo||"—"}</b></div>
        </div>
        <div className="ssa-entry-meta">
          <label>Entry Date <input type="date" value={entryDate} onChange={e=>{setEntryDate(e.target.value);setEditId("");}}/></label>
          <span>{activeId?"Existing entry · Update mode":"New entry · Save mode"}</span>
        </div>
        <div className="ssa-schemes" role="group" aria-label="Campaign schemes">
          <label className={apy?"checked":""}><input type="checkbox" checked={apy} onChange={e=>setApy(e.target.checked)}/> APY</label>
          <label className={pmjjby?"checked":""}><input type="checkbox" checked={pmjjby} onChange={e=>setPmjjby(e.target.checked)}/> PMJJBY</label>
          <label className={pmsby?"checked":""}><input type="checkbox" checked={pmsby} onChange={e=>setPmsby(e.target.checked)}/> PMSBY</label>
        </div>
        <div className="ssa-save-buttons">
          <button type="button" className="ssa-save" disabled={busy||!customer||!!activeId} onClick={()=>void save("create")}>▣ Save New Entry</button>
          <button type="button" className="ssa-update" disabled={busy||!customer||!activeId} onClick={()=>void save("update")}>✎ Update Entry</button>
          <button type="button" onClick={()=>{setCustomer(null);setMatches([]);setQuery("");setEditId("");setApy(false);setPmjjby(false);setPmsby(false);}}>Clear</button>
        </div>
        <small className="ssa-help">Select once and save. To change a previous entry, use Update Entry or Edit below.</small>
      </section>
      <section className="ssa-panel ssa-reports" aria-label="Reports and actions">
        <h2>▱ Reports &amp; Actions</h2>
        <div className="ssa-report-buttons">
          <button className="pdf" type="button" disabled={loading} onClick={()=>setReportKind("pdf")}><span>▣</span>PDF Report</button>
          <button className="excel" type="button" disabled={loading} onClick={()=>setReportKind("excel")}><span>▦</span>Excel Report</button>
          <button className="print" type="button" disabled={loading} onClick={()=>setReportKind("print")}><span>▤</span>Print</button>
          <button className="share" type="button" disabled={loading} onClick={()=>setReportKind("share")}><span>●</span>Share</button>
        </div>
      </section>
    </div>
    {error&&<p className="ssa-alert error" role="alert">{error}</p>}
    {notice&&<p className="ssa-alert" role="status">{notice}</p>}
    <section className="ssa-panel ssa-entries" aria-label="SSA Campaign entries">
      <header><h2>☷ SSA Campaign Entries</h2>
        <div className="ssa-chips">{([["all","All"],["today","Today"],["week","Last 7 Days"],["month","This Month"],["year","This Year"]] as const)
          .map(([value,label])=><button type="button" key={value} className={preset===value?"active":""} onClick={()=>{setPreset(value);setPage(1);}}>{label}</button>)}</div>
        <input type="search" placeholder="Search Account No." aria-label="Filter SSA entries" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}/>
      </header>
      <div className="ssa-table-wrap"><table>
        <thead><tr><th>#</th><th>Entry Date</th><th>Customer Name</th><th>Account Number</th><th>APY</th><th>PMJJBY</th><th>PMSBY</th><th>Sync</th><th>Action</th></tr></thead>
        <tbody>{visible.map((item,i)=><tr key={item.entryId}>
          <td>{(currentPage-1)*8+i+1}</td><td>{item.entryDate}</td><td>{item.name}</td><td>{item.accountNo}</td>
          <td>{item.apy?<span className="ssa-check">✓</span>:"–"}</td>
          <td>{item.pmjjby?<span className="ssa-check">✓</span>:"–"}</td>
          <td>{item.pmsby?<span className="ssa-check">✓</span>:"–"}</td>
          <td className={item.syncError?"ssa-conflict":item.pending?"ssa-pending":"ssa-synced"}>{item.syncError?"Review":item.pending?"Pending":"Synced"}</td>
          <td><button type="button" className="ssa-edit-btn" onClick={()=>{
            choose(asCustomer(item as unknown as Record<string,unknown>),item);
            document.querySelector(".ssa-editor")?.scrollIntoView({behavior:"smooth",block:"start"});
          }}>✎ Edit</button></td>
        </tr>)}
        {!visible.length&&<tr><td colSpan={9} className="ssa-empty">No entries for these filters.</td></tr>}</tbody>
      </table></div>
      <footer><span>Showing {visible.length} of {filtered.length} entries{hasMore?" · More older entries exist in Google Sheet":""}</span>
        <div><button type="button" disabled={currentPage===1} onClick={()=>setPage(Math.max(1,currentPage-1))}>‹</button>
          <span>{currentPage} / {totalPages}</span>
          <button type="button" disabled={currentPage===totalPages} onClick={()=>setPage(Math.min(totalPages,currentPage+1))}>›</button></div>
      </footer>
    </section>
    <div className="ssa-print-report">
      <h2>BANK SETU — SSA Campaign Report</h2><p>{printSelection?.description||""} · Total {printSelection?.rows.length||0} · APY {ssaReportCounts(printSelection?.rows||[]).apy} · PMJJBY {ssaReportCounts(printSelection?.rows||[]).pmjjby} · PMSBY {ssaReportCounts(printSelection?.rows||[]).pmsby}</p>
      <table><thead><tr><th>Date</th><th>Customer</th><th>Account Number</th><th>APY</th><th>PMJJBY</th><th>PMSBY</th></tr></thead>
        <tbody>{(printSelection?.rows||[]).map(e=><tr key={e.entryId}><td>{e.entryDate}</td><td>{e.name}</td><td>{e.accountNo}</td>
          <td>{e.apy?"Yes":"No"}</td><td>{e.pmjjby?"Yes":"No"}</td><td>{e.pmsby?"Yes":"No"}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
