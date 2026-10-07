import { useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { localDataFetch, getDataIdToken, getLocalSnapshot, localModeEnabled } from "./core/localData";
import { getTenantApiUrl } from "./tenantApi";
import { isAndroid } from "./platform/android/runtime";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const desktopBridge = () => (window as Window & {bankSetuDesktop?: {copyText?: (text:string)=>Promise<void>;shareImage?: (image:string)=>Promise<void>}}).bankSetuDesktop;
type Customer = Record<string, unknown> & { rowNumber?: number; recordId?: string };
const value = (item: unknown) => String(item ?? "").trim();
const title = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
const identity = (customer: Customer) => value(customer.recordId || customer.rowNumber || customer.accountNo);
const visibleFields = (customer: Customer) => Object.entries(customer).filter(([key, item]) =>
  !["photoDataUrl", "photoPreview", "photoUrl", "pdfDataUrl", "pdfUrl", "recordId", "revision", "rowNumber"].includes(key) &&
  item != null && typeof item !== "object" && value(item) !== ""
);

async function request(body: Record<string, unknown>) {
  const apiUrl = getTenantApiUrl();
  if (!apiUrl || !getAuth().currentUser) throw new Error("An active, verified customer workspace is required.");
  const idToken = await getDataIdToken();
  const response = await localDataFetch(apiUrl, {
    method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"},
    body: JSON.stringify({...body, idToken}),
  });
  if (!response.ok) throw new Error("Customer workspace is unavailable.");
  return response.json();
}

export function snapshot(customer: Customer): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      const fields = visibleFields(customer);
      const width = 920, rowHeight = 34;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = Math.max(420, 170 + fields.length * rowHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image preview is unavailable.");
      ctx.fillStyle = "#fff2f4"; ctx.fillRect(0, 0, width, canvas.height);
      ctx.fillStyle = "#8f2448"; ctx.font = "bold 32px sans-serif";
      ctx.fillText("Bank Setu · Customer Preview", 36, 58);
      ctx.fillStyle = "#241d27"; ctx.font = "18px sans-serif";
      fields.forEach(([key, item], index) => {
        const y = 125 + index * rowHeight;
        ctx.fillStyle = index % 2 ? "#ffe3e9" : "#fff8f9";
        ctx.fillRect(26, y - 25, width - 52, 31);
        ctx.fillStyle = "#742744"; ctx.font = "bold 16px sans-serif";
        ctx.fillText(title(key), 38, y, 245);
        ctx.fillStyle = "#241d27"; ctx.font = "16px sans-serif";
        ctx.fillText(value(item), 295, y, 560);
      });
      const photo = value(customer.photoPreview || customer.photoDataUrl || customer.photoUrl);
      if (photo) {
        try {
          const image = new Image(); image.crossOrigin = "anonymous";
          await new Promise<void>((done, fail) => {
            image.onload = () => done(); image.onerror = () => fail();
            image.src = photo;
          });
          ctx.drawImage(image, width - 155, 15, 95, 95);
        } catch { /* Keep available customer details when remote photo cannot be read. */ }
      }
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create preview image.")), "image/png");
    } catch (error) { reject(error); }
  });
}

export default function AllCustomerData() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const page = useRef(0);
  const total = useRef(0);
  const generation = useRef(0);

  const loadPage = async (replace = false) => {
    if ((loading && !replace) || !navigator.onLine) return;
    setLoading(true);
    const id = generation.current;
    try {
      if (replace) {
        const first = await request({action:"getAllCustomers",page:1,pageSize:1});
        if (!first.success) throw new Error(first.message || "Could not load customers.");
        total.current = Number(first.totalRows || first.customers?.length || 0);
        page.current = Math.ceil(total.current / 100);
      }
      const current = page.current;
      if (current < 1) { setMore(false); return; }
      const result = await request({action:"getAllCustomers",page:current,pageSize:100});
      if (!result.success) throw new Error(result.message || "Could not load customers.");
      if (id !== generation.current) return;
      const batch = (result.customers || []) as Customer[];
      setRows(previous => {
        const seen = new Set<string>();
        return (replace ? [...batch].reverse() : [...previous, ...batch.reverse()]).filter(item => {
          const key = identity(item);
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
      });
      page.current = current - 1; setMore(page.current > 0);
    } catch (cause) { if (id === generation.current) setError(cause instanceof Error ? cause.message : "Customer list unavailable."); }
    finally { if (id === generation.current) setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    // The current verified user's local scope supplies an immediate local-first list.
    if (localModeEnabled()) void getLocalSnapshot().then(snapshot => {
      if (!active) return;
      setRows(previous => previous.length ? previous : snapshot.records.filter(record => !record.deleted).sort((a,b) => b.rowNumber - a.rowNumber).map(record =>
        ({...record.customer,rowNumber:record.rowNumber,recordId:record.recordId})
      ));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Local records unavailable."); });
    return () => { active = false; generation.current += 1; };
    // The workspace remounts this page on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = ++generation.current;
    setLoading(false);
    if (!query.trim()) {
      setError("");
      if (navigator.onLine) void loadPage(true);
      else void getLocalSnapshot().then(snapshot => {
        if (id === generation.current) setRows(snapshot.records.filter(record => !record.deleted).sort((a,b) => b.rowNumber - a.rowNumber).map(record => ({...record.customer,rowNumber:record.rowNumber,recordId:record.recordId})));
      }).catch(cause => { if (id === generation.current) setError(cause instanceof Error ? cause.message : "Local records unavailable."); });
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const result = await request({action:"searchCustomer",query:query.trim()});
        if (id !== generation.current) return;
        setRows(result.success ? (result.matches || [result.customer]).filter(Boolean) : []);
        if (!result.success && result.message && !/not found/i.test(result.message)) setError(result.message);
        setMore(false);
      } catch (cause) { if (id === generation.current) setError(cause instanceof Error ? cause.message : "Search failed."); }
      finally { if (id === generation.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const open = async (customer: Customer) => {
    setSelected(customer); setError("");
    try {
      const result = await request({action:"getCustomerByRowNumber",rowNumber:customer.rowNumber,recordId:customer.recordId});
      if (result.success && identity(customer) === identity(result.customer || {})) setSelected({...customer,...result.customer});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Full customer preview unavailable."); }
  };

  const share = async () => {
    if (!selected) return;
    try {
      const blob = await snapshot(selected);
      const name = "BankSetu-customer-preview.png";
      if (isAndroid()) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(blob);
        });
        const saved = await Filesystem.writeFile({path:name,data,directory:Directory.Cache});
        await Share.share({title:"Bank Setu Customer Preview",files:[saved.uri],dialogTitle:"Share customer preview"});
      } else if (desktopBridge()?.shareImage) {
        const dataUrl = await new Promise<string>((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
        await desktopBridge()!.shareImage!(dataUrl);
        setCopyMessage("Preview image copied. Paste it into the WhatsApp chat.");
      } else if (navigator.share && navigator.canShare?.({files:[new File([blob],name,{type:"image/png"})]})) {
        await navigator.share({files:[new File([blob],name,{type:"image/png"})],title:"Bank Setu Customer Preview"});
      } else {
        const link = document.createElement("a"); const url = URL.createObjectURL(blob);
        link.href=url; link.download=name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
        setCopyMessage("Preview image downloaded for sharing.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not share preview image."); }
  };

  return <section className="all-customer-data" style={{background:"#fff",borderRadius:16,padding:20}}>
    <h2>All Customer Data</h2>
    <input aria-label="Search all customer data" placeholder="Search customer ID, account number, name, Aadhaar, mobile…" value={query} onChange={event => setQuery(event.target.value)}
      style={{width:"100%",boxSizing:"border-box",padding:12,borderRadius:10,border:"1px solid #d7d7df",marginBottom:16}} />
    {error && <p role="alert" style={{color:"#ad2144"}}>{error}</p>}
    {copyMessage && <p role="status">{copyMessage}</p>}
    <div style={{maxHeight:"min(68vh, 690px)",overflow:"auto"}} onScroll={event => {
      const node=event.currentTarget;
      if (!query.trim() && more && !loading && node.scrollTop + node.clientHeight >= node.scrollHeight - 200) void loadPage();
    }}>
      <table style={{borderCollapse:"collapse",width:"100%",minWidth:680,textAlign:"left"}}>
        <thead><tr>{["Customer ID","Name","Account Number","Mobile Number","Aadhaar Number","Account Opening Date"].map(label =>
          <th key={label} style={{position:"sticky",top:0,background:"#f9e8ee",padding:10}}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((customer,index) => <tr key={identity(customer) || index} tabIndex={0} onClick={() => void open(customer)}
          onKeyDown={event => { if (event.key === "Enter") void open(customer); }}
          style={{cursor:"pointer",background:index%2?"#fff8fa":"#fff",borderBottom:"1px solid #eee"}}>
          <td style={{padding:9}}>{value(customer.enrolId)}</td><td style={{padding:9}}>{value(customer.name)}</td>
          <td style={{padding:9}}>{value(customer.accountNo)} <button type="button" title="Copy account number" aria-label={"Copy account number " + value(customer.accountNo)}
            onClick={async event => {event.stopPropagation();try{if (desktopBridge()?.copyText) await desktopBridge()!.copyText!(String(customer.accountNo ?? "")); else await navigator.clipboard.writeText(String(customer.accountNo ?? ""));setCopyMessage("Account number copied.");}catch{setError("Clipboard unavailable.");}}}>⧉</button></td>
          <td style={{padding:9}}>{value(customer.contact || customer.mobile)}</td><td style={{padding:9}}>{value(customer.uidaiNo || customer.aadhaarNo || customer.aadharNo)}</td>
          <td style={{padding:9}}>{value(customer.accountOpeningDate)}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && !loading && <p>No matching customers.</p>}
      {loading && <p role="status">Loading customers…</p>}
      {!query.trim() && more && <button type="button" disabled={loading} onClick={() => void loadPage()}>Load more customers</button>}
    </div>
    {selected && <div className="customer-preview-overlay" role="presentation" onClick={() => setSelected(null)}>
      <div className="customer-preview-card" role="dialog" aria-modal="true" aria-label="Customer Preview" onClick={event => event.stopPropagation()}>
        <div className="customer-preview-heading"><span>BANK SETU · CUSTOMER DETAILS</span><h2>Customer Preview</h2><p>{value(selected.name)} · {value(selected.enrolId)}</p></div>
        {value(selected.photoPreview || selected.photoDataUrl || selected.photoUrl) && <img src={value(selected.photoPreview || selected.photoDataUrl || selected.photoUrl)} alt="Customer photograph" style={{width:110,height:120,objectFit:"cover",borderRadius:10}} />}
        <div className="customer-preview-fields">{visibleFields(selected).map(([key,item]) =>
          <div key={key}><strong>{title(key)}</strong><span>{value(item)}</span></div>)}</div>
        <div className="customer-preview-actions">
          <button type="button" onClick={() => void share()}>Share</button>
          <button type="button" onClick={() => window.print()}>Print</button>
          <button type="button" onClick={() => setSelected(null)}>Close</button>
        </div>
      </div>
    </div>}
    <style>{`
      .all-customer-data tbody tr:hover,.all-customer-data tbody tr:focus {background:#fbd9e3!important;outline:2px solid #d17a9c}
      .customer-preview-overlay {position:fixed;inset:0;z-index:3000;background:#442330a6;display:grid;place-items:center;padding:16px}
      .customer-preview-card {background:linear-gradient(145deg,#fff6f7,#f9dce5);color:#35232c;border:2px solid #eeb9ca;border-radius:20px;box-shadow:0 22px 65px #3813226b;padding:24px;width:min(760px,95vw);max-height:88vh;overflow:auto}
      .customer-preview-heading {background:linear-gradient(120deg,#8f2448,#d24b72);color:white;padding:20px 24px;border-radius:15px}.customer-preview-heading h2 {margin:7px 0;font-size:clamp(23px,4vw,34px)}.customer-preview-heading p {margin:0;overflow-wrap:anywhere}.customer-preview-heading span {font-size:12px;letter-spacing:.12em;font-weight:700}.customer-preview-fields {display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:16px 0}
      .customer-preview-fields>div {background:#fff9facc;padding:9px;border-radius:8px;overflow-wrap:anywhere}
      .customer-preview-fields strong {display:block;color:#853550;font-size:12px;margin-bottom:4px}
      .customer-preview-actions {display:flex;gap:10px;justify-content:flex-end}
      .customer-preview-actions button:first-child {background:#a42451;color:white}.customer-preview-actions button {padding:10px 18px;border-radius:9px;border:1px solid #c77493;background:#fff;cursor:pointer}
      @media(max-width:600px){.customer-preview-card{padding:12px;width:100%;max-height:94dvh}.customer-preview-fields{grid-template-columns:1fr}.customer-preview-actions{flex-wrap:wrap}.customer-preview-actions button{flex:1}}
      @media print {body * {visibility:hidden!important}.customer-preview-overlay,.customer-preview-overlay * {visibility:visible!important}.customer-preview-overlay {position:absolute;inset:0;background:white;padding:0}.customer-preview-card {box-shadow:none;max-height:none;width:auto;border:0}.customer-preview-actions {display:none!important}}
    `}</style>
  </section>;
}
