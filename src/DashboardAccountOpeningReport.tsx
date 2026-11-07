import {lazy,Suspense,useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {customerListScope} from "./customerListCache";
import {
  localTodayKey,localMonth,monthStart,monthEnd,matchingOpeningCustomers,
  openingDateKey,openingCustomerName,openingAccountNo,openingStatus,openingAmount,
  type OpeningCustomer
} from "./core/accountOpeningReport";
import "./DashboardAccountOpeningReport.css";

// Exactly the same All Customer Data preview implementation, not a duplicate.
const AllCustomerData=lazy(()=>import("./AllCustomerData"));
type View="month"|"months"|"dates";
const formatDate=(key:string)=>{
  const parts=key.split("-").map(Number);
  return parts.length===3?new Date(Date.UTC(parts[0],parts[1]-1,parts[2]))
    .toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}):key;
};
const numberLabel=(n:number)=>new Intl.NumberFormat("en-IN").format(n);
const moneyLabel=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(n);
export default function DashboardAccountOpeningReport({customers,onClose,loading=false,error=""}:{
  customers:OpeningCustomer[];onClose:()=>void;loading?:boolean;error?:string
}){
  const [mode,setMode]=useState<View>("month");
  const [month,setMonth]=useState(()=>localMonth());
  const [fromMonth,setFromMonth]=useState(()=>localMonth());
  const [toMonth,setToMonth]=useState(()=>localMonth());
  const [startDate,setStartDate]=useState(()=>monthStart(localMonth())||"");
  const [endDate,setEndDate]=useState(()=>localTodayKey());
  const [search,setSearch]=useState("");
  const [pageSize,setPageSize]=useState(100);
  const [message,setMessage]=useState("");
  const [previewCustomer,setPreviewCustomer]=useState<OpeningCustomer|null>(null);
  const [workspaceScope]=useState(()=>customerListScope());

  const start=mode==="month"?monthStart(month):
    mode==="months"?monthStart(fromMonth):startDate;
  const end=mode==="month"?monthEnd(month):
    mode==="months"?monthEnd(toMonth):endDate;
  const invalid=!start||!end||end<start;
  const matches=useMemo(()=>start&&end&&end>=start?matchingOpeningCustomers(customers,start,end):[],[customers,start,end]);
  const queried=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase();
    return query?matches.filter(row=>[openingCustomerName(row),openingAccountNo(row),openingStatus(row)]
      .some(text=>text.toLocaleLowerCase().includes(query))):matches;
  },[matches,search]);
  const shown=queried.slice(0,pageSize);
  const amounts=matches.map(openingAmount).filter((value):value is number=>value!==null);
  const totalAmount=amounts.reduce((sum,amount)=>sum+amount,0);
  useEffect(()=>{setPageSize(100);},[mode,month,fromMonth,toMonth,startDate,endDate,search]);

  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&!previewCustomer)onClose();
    };
    const workspaceChanged=()=>{
      if(customerListScope()!==workspaceScope){setPreviewCustomer(null);onClose();}
    };
    window.addEventListener("keydown",keydown);
    window.addEventListener("banksetu-workspace-change",workspaceChanged);
    return()=>{
      window.removeEventListener("keydown",keydown);
      window.removeEventListener("banksetu-workspace-change",workspaceChanged);
    };
  },[onClose,previewCustomer,workspaceScope]);
  const copyAccount=async(number:string)=>{
    if(!number)return;
    try{
      const desktop=(window as Window&{bankSetuDesktop?:{copyText?:(value:string)=>Promise<void>}}).bankSetuDesktop;
      if(desktop?.copyText)await desktop.copyText(number);
      else await navigator.clipboard.writeText(number);
      setMessage("Account number copied.");
    }catch{setMessage("Clipboard unavailable on this device.");}
  };
  const openCustomer=(row:OpeningCustomer)=>{
    if(customerListScope()!==workspaceScope){setMessage("The signed-in workspace changed. Reopen this report.");return;}
    setPreviewCustomer(row);
  };
  return createPortal(<>
    <div className="dashboard-opening-overlay" onClick={onClose}>
      <section className="dashboard-opening-panel" role="dialog" aria-modal="true"
        aria-label="Account Opening Report" onClick={event=>event.stopPropagation()}>
        <header className="dashboard-opening-header">
          <div><h2>Account Opening Report</h2><p>Filter by a month, several months, or exact opening dates.</p></div>
          <button type="button" onClick={onClose} aria-label="Close account opening report">×</button>
        </header>
        <div className="dashboard-opening-filters">
          <div className="dashboard-opening-tabs" role="group" aria-label="Report range type">
            <button type="button" aria-pressed={mode==="month"} onClick={()=>setMode("month")}>One Month</button>
            <button type="button" aria-pressed={mode==="months"} onClick={()=>setMode("months")}>Month Range</button>
            <button type="button" aria-pressed={mode==="dates"} onClick={()=>setMode("dates")}>Date Range</button>
          </div>
          {mode==="month"&&<label>Choose Month
            <input aria-label="Choose account opening month" type="month" value={month}
              onChange={event=>setMonth(event.target.value)}/></label>}
          {mode==="months"&&<>
            <label>From Month <input type="month" aria-label="From opening month" value={fromMonth}
              onChange={event=>setFromMonth(event.target.value)}/></label>
            <label>To Month <input type="month" aria-label="To opening month" value={toMonth}
              onChange={event=>setToMonth(event.target.value)}/></label>
          </>}
          {mode==="dates"&&<>
            <label>From Date <input type="date" aria-label="From account opening date" value={startDate}
              onChange={event=>setStartDate(event.target.value)}/></label>
            <label>To Date <input type="date" aria-label="To account opening date" value={endDate}
              onChange={event=>setEndDate(event.target.value)}/></label>
          </>}
          <label className="dashboard-opening-search">Search Results
            <input type="search" aria-label="Search opening report customers" value={search}
              placeholder="Name, account number or status…" onChange={event=>setSearch(event.target.value)}/>
          </label>
        </div>
        {invalid?<p role="alert" className="dashboard-opening-error">Choose a valid date range with the start before the end.</p>:null}
        {error?<p role="alert" className="dashboard-opening-error">{error}</p>:null}
        {message&&<p role="status" className="dashboard-opening-message">{message}</p>}
        <div className="dashboard-opening-overview">
          <div><small>Accounts Opened</small><strong>{loading?"…":numberLabel(matches.length)}</strong></div>
          <div><small>Selected Period</small><strong>{start&&end?formatDate(start)+" – "+formatDate(end):"Choose dates"}</strong></div>
          {amounts.length>0&&<div><small>Known Opening Amount ({amounts.length})</small><strong>{moneyLabel(totalAmount)}</strong></div>}
        </div>
        <div className="dashboard-opening-table-scroll">
          <table>
            <thead><tr><th>Customer Name</th><th>Account Number</th><th>Account Opening Date</th><th>Active Status</th>{amounts.length>0&&<th>Opening Amount</th>}</tr></thead>
            <tbody>
              {shown.map((customer,index)=>{
                const account=openingAccountNo(customer),date=openingDateKey(customer);
                const status=openingStatus(customer);
                return <tr key={String(customer.recordId||customer.rowNumber||account||index)}
                  tabIndex={0} aria-label={"Open customer preview: "+openingCustomerName(customer)}
                  title="Click to open the same All Customer Data preview"
                  onClick={()=>openCustomer(customer)}
                  onKeyDown={event=>{if(event.currentTarget===event.target&&event.key==="Enter"){event.preventDefault();openCustomer(customer);}}}>
                  <td><strong>{openingCustomerName(customer)}</strong></td>
                  <td className="dashboard-opening-number"><span>{account||"—"}</span>
                    {account&&<button type="button" aria-label={"Copy account number "+account}
                      onClick={event=>{event.stopPropagation();void copyAccount(account);}}>Copy</button>}</td>
                  <td>{date?formatDate(date):"—"}</td>
                  <td><span className={"dashboard-opening-status "+(status.toLowerCase()==="active"?"is-active":status.toLowerCase()==="inactive"?"is-inactive":"")}>{status}</span></td>
                  {amounts.length>0&&<td>{openingAmount(customer)!==null?moneyLabel(openingAmount(customer)!):"—"}</td>}
                </tr>;
              })}
            </tbody>
          </table>
          {!loading&&!invalid&&matches.length===0&&<p className="dashboard-opening-empty">No customers with a recorded account opening date in this period.</p>}
          {!loading&&matches.length>0&&queried.length===0&&<p className="dashboard-opening-empty">No matching customers for this search.</p>}
          {loading&&<p role="status" className="dashboard-opening-empty">Loading customer records…</p>}
        </div>
        <footer className="dashboard-opening-footer">
          <span>Showing {numberLabel(shown.length)} of {numberLabel(queried.length)} matching customers.
            {customers.length&&!loading?" Records without a valid opening date are excluded.":""}</span>
          {queried.length>pageSize&&<button type="button" onClick={()=>setPageSize(value=>value+100)}>Load More</button>}
          <button type="button" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>
    {previewCustomer&&<Suspense fallback={<p role="status" className="dashboard-opening-preview-loading">Opening customer preview…</p>}>
      <AllCustomerData key={String(previewCustomer.recordId||previewCustomer.rowNumber||openingAccountNo(previewCustomer))}
        previewCustomer={previewCustomer} onPreviewClose={()=>setPreviewCustomer(null)}/>
    </Suspense>}
  </>,document.body);
}
