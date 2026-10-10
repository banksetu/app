import { useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { localDataFetch, getDataIdToken, getLocalSnapshot, getActiveLocalCustomers, localModeEnabled } from "./core/localData";
import { requireLicensedWrite } from "./core/licenseAccess";
import { getTenantApiUrl } from "./tenantApi";
import { isAndroid } from "./platform/android/runtime";
import { registerPlugin } from "@capacitor/core";
import html2canvas from "html2canvas";

const nativeShare = registerPlugin<{shareImage(options:{base64:string}):Promise<void>}>("BankSetuShare");

const desktopBridge = () => (window as Window & {bankSetuDesktop?: {copyText?: (text:string)=>Promise<void>;shareImage?: (image:string)=>Promise<{saved:boolean;canceled?:boolean}>}}).bankSetuDesktop;
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

async function previewImage(card: HTMLElement): Promise<Blob> {
  const width = Math.ceil(card.getBoundingClientRect().width);
  if (!width) throw new Error("Customer preview is not visible. Open it again and retry.");
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;z-index:-1;pointer-events:none`;
  const copy = card.cloneNode(true) as HTMLElement;
  copy.querySelector(".customer-preview-close")?.remove();
  copy.querySelector(".customer-preview-actions")?.remove();
  copy.style.cssText += `;width:${width}px!important;max-height:none!important;overflow:visible!important`;
  host.appendChild(copy);
  document.body.appendChild(host);
  try {
    await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]);
    for (const img of copy.querySelectorAll<HTMLImageElement>("img")) {
      if (!img.src.startsWith("data:")) {
        const response = await fetch(img.src, {mode:"cors",signal:AbortSignal.timeout(3000)});
        if (!response.ok) throw new Error("Customer photo could not be included in the share image.");
        const blob = await response.blob();
        img.src = await new Promise<string>((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
      }
      await Promise.race([img.decode(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("Photo capture timed out.")),3000))]);
    }
    const canvas=await html2canvas(copy,{backgroundColor:null,scale:2,useCORS:true,allowTaint:false,logging:false,
      width,height:Math.ceil(copy.scrollHeight),scrollX:0,scrollY:0});
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Share image cannot be created.")),"image/png"));
  } finally {
    host.remove();
  }
}

export function snapshot(customer: Customer, card?: HTMLElement | null): Promise<Blob> {
  if (card) return previewImage(card);
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
            const timer=setTimeout(()=>fail(new Error("Photo unavailable.")),3000);
            image.onload = () => {clearTimeout(timer);done();}; image.onerror = () => {clearTimeout(timer);fail(new Error("Photo unavailable."));};
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
  const previewCard = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const page = useRef(0);
  const total = useRef(0);
  const generation = useRef(0);

  const loadPage = async (replace = false) => {
    if ((loading && !replace) || (!navigator.onLine && !localModeEnabled())) return;
    setLoading(true);
    const id = generation.current;
    try {
      if (localModeEnabled()) {
        const customers = await getActiveLocalCustomers();
        if (id === generation.current) {setRows(customers);setMore(false);}
        return;
      }
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
    if (localModeEnabled()) void getActiveLocalCustomers().then(customers => {
      if (!active) return;
      setRows(customers);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Local records unavailable."); });
    return () => { active = false; generation.current += 1; };
    // The workspace remounts this page on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reconcile = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!localModeEnabled()) return;
        void getActiveLocalCustomers().then(customers => {
          if (!query.trim()) setRows(customers);
          else {const visible=new Set(customers.map(customer=>value(customer.recordId)));setRows(previous=>previous.filter(row=>visible.has(value(row.recordId))));}
          setSelected(previous => previous && !customers.some(customer=>identity(customer)===identity(previous)) ? null : previous);
        }).catch(() => undefined);
      }, 120);
    };
    window.addEventListener("banksetu-sync-change", reconcile);
    return () => {clearTimeout(timer);window.removeEventListener("banksetu-sync-change", reconcile);};
  }, [query]);

  useEffect(() => {
    const id = ++generation.current;
    setLoading(false);
    if (!query.trim()) {
      setError("");
      if (navigator.onLine || localModeEnabled()) void loadPage(true);
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
    if (!selected || sharing) return;
    const notice = (type: "success" | "error" | "progress",message: string) => {
      const event = new Event("banksetu-notification") as Event & {detail:{type:string;title:string;message:string}};
      event.detail={type,title:type==="error"?"Share unavailable":type==="progress"?"Preparing share":"Preview ready to share",message};window.dispatchEvent(event);
    };
    setSharing(true);setError("");
    try {
      notice("progress","Preparing customer preview image.");
      // Let the progress state paint before the image is rendered on mobile.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!previewCard.current) throw new Error("Customer preview is unavailable. Open it again and retry.");
      const blob = await Promise.race([previewImage(previewCard.current),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("Preview capture timed out. Please retry.")),15000))]);
      const name = "BankSetu-customer-preview.png";
      if (isAndroid()) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(blob);
        });
        notice("progress","Opening Android share options.");
        await nativeShare.shareImage({base64:data});
        notice("success","Android share options opened; choose the recipient.");
      } else if (desktopBridge()?.shareImage) {
        const dataUrl = await new Promise<string>((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
        const result=await desktopBridge()!.shareImage!(dataUrl);
        if (result?.canceled) return;
        if (!result?.saved) throw new Error("Preview PNG could not be saved.");
        setCopyMessage("Preview PNG saved. Attach it in WhatsApp Desktop/Web or another app.");
        notice("success","Preview PNG saved. Attach it in WhatsApp Desktop/Web or another app.");
      } else if (navigator.share && navigator.canShare?.({files:[new File([blob],name,{type:"image/png"})]})) {
        await navigator.share({files:[new File([blob],name,{type:"image/png"})],title:"Bank Setu Customer Preview"});
        notice("success","Share options opened; choose the recipient.");
      } else {
        const link = document.createElement("a"); const url = URL.createObjectURL(blob);
        link.href=url; link.download=name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
        setCopyMessage("Preview image downloaded for sharing.");
        notice("success","Preview image downloaded for sharing.");
      }
    } catch (cause) { const message=cause instanceof Error ? cause.message : "Could not share preview image.";if (!/share canceled/i.test(message)) {setError(message);notice("error",message);} }
    finally {setSharing(false);}
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
      <div ref={previewCard} className="customer-preview-card" role="dialog" aria-modal="true" aria-label="Customer Preview" onClick={event => event.stopPropagation()}>
        <div className="customer-preview-heading"><span className="customer-preview-avatar">●</span><div><h2>Bank Setu – Customer Preview</h2><p>Complete details and passbook preview</p></div><button className="customer-preview-close" type="button" aria-label="Close preview" onClick={() => setSelected(null)}>×</button></div>
        <div className="customer-preview-content">
          <div className="customer-preview-identity">
            {value(selected.photoPreview || selected.photoDataUrl || selected.photoUrl)
              ? <img src={value(selected.photoPreview || selected.photoDataUrl || selected.photoUrl)} alt="Customer photograph" />
              : <div className="customer-preview-photo-placeholder" aria-label="No customer photograph">●</div>}
            <div className="customer-preview-account">
              <div className="customer-preview-name">{value(selected.name) || "Customer"}</div>
              {value(selected.accountType || selected.acType || selected.accountCategory) && <span className="customer-preview-type">{value(selected.accountType || selected.acType || selected.accountCategory)}</span>}
              <span className="customer-preview-account-label">Account No.</span>
              <div className="customer-preview-account-number"><span className="customer-preview-account-value">{value(selected.accountNo) || "—"}</span>
                {value(selected.accountNo) && <button type="button" title="Copy account number" aria-label="Copy account number" onClick={async () => {try {if (desktopBridge()?.copyText) await desktopBridge()!.copyText!(value(selected.accountNo)); else await navigator.clipboard.writeText(value(selected.accountNo));setCopyMessage("Account number copied.");} catch {setError("Clipboard unavailable.");}}}>▣</button>}
              </div>
            </div>
            {value(selected.status) && <span className="customer-preview-status">{/active/i.test(value(selected.status)) && !/inactive/i.test(value(selected.status)) ? "✓ " : ""}{value(selected.status)}</span>}
          </div>
          <div className="customer-preview-sections">
            <section className="customer-preview-section"><h3>♟ &nbsp;Personal Information</h3><dl>
              {([["Customer Name",selected.name],["Father's / C/O Name",selected.fatherName || selected.coName],["Date of Birth",selected.dateOfBirth || selected.dob],["Gender",selected.gender],["Customer ID",selected.enrolId]] as [string,unknown][]).filter(([,item]) => value(item)).map(([label,item]) => <div key={label}><dt>{label}</dt><dd>{value(item)}</dd></div>)}
            </dl></section>
            <section className="customer-preview-section"><h3>☎ &nbsp;Contact Information</h3><dl>
              {([["Mobile Number",selected.contact || selected.mobile],["Email",selected.email]] as [string,unknown][]).filter(([,item]) => value(item)).map(([label,item]) => <div key={label}><dt>{label}</dt><dd>{value(item)}</dd></div>)}
            </dl></section>
            {(value(selected.fullAddress || selected.address || selected.postOffice || selected.pinCode)) && <section className="customer-preview-section"><h3>● &nbsp;Address</h3><p className="customer-preview-address">{value(selected.fullAddress || selected.address)}{selected.postOffice && !value(selected.fullAddress).includes(value(selected.postOffice)) ? ` · PO: ${value(selected.postOffice)}` : ""}{selected.pinCode && !value(selected.fullAddress || selected.address).includes(value(selected.pinCode)) ? ` · ${value(selected.pinCode)}` : ""}</p></section>}
            <div className="customer-preview-bottom">
              {(value(selected.branch || selected.branchName || selected.ifsc || selected.ifscCode)) && <section className="customer-preview-section"><h3>▤ &nbsp;Branch Details</h3><dl>
                {([["Branch",selected.branch || selected.branchName],["IFSC",selected.ifsc || selected.ifscCode]] as [string,unknown][]).filter(([,item]) => value(item)).map(([label,item]) => <div key={label}><dt>{label}</dt><dd>{value(item)}</dd></div>)}
              </dl></section>}
              <section className="customer-preview-section"><h3>▦ &nbsp;Account Details</h3><dl>
                {([["A/C Type",selected.accountType || selected.acType || selected.accountCategory],["Open Date",selected.accountOpeningDate],["AOF No.",selected.aofNo]] as [string,unknown][]).filter(([,item]) => value(item)).map(([label,item]) => <div key={label}><dt>{label}</dt><dd>{value(item)}</dd></div>)}
              </dl></section>
            </div>
            {visibleFields(selected).filter(([key]) => !["name","fatherName","coName","dateOfBirth","dob","gender","enrolId","contact","mobile","email","fullAddress","address","postOffice","pinCode","branch","branchName","ifsc","ifscCode","accountType","acType","accountCategory","accountOpeningDate","aofNo","status","accountNo"].includes(key)).length > 0 && <section className="customer-preview-section"><h3>▤ &nbsp;Additional Details</h3><dl>{visibleFields(selected).filter(([key]) => !["name","fatherName","coName","dateOfBirth","dob","gender","enrolId","contact","mobile","email","fullAddress","address","postOffice","pinCode","branch","branchName","ifsc","ifscCode","accountType","acType","accountCategory","accountOpeningDate","aofNo","status","accountNo"].includes(key)).map(([key,item]) => <div key={key}><dt>{title(key)}</dt><dd>{value(item)}</dd></div>)}</dl></section>}
          </div>
          <div className="customer-preview-actions">
            <button type="button" disabled={sharing} onClick={() => void share()}>{sharing ? "Preparing / sharing…" : "Share"}</button>
            <button type="button" onClick={() => void requireLicensedWrite().then(()=>window.print()).catch(reason=>setError(reason instanceof Error?reason.message:"License verification is required to print."))}>Print</button>
            <button type="button" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      </div>
    </div>}
    <style>{`
      .all-customer-data tbody tr:hover,.all-customer-data tbody tr:focus {background:#fbd9e3!important;outline:2px solid #d17a9c}
      .customer-preview-overlay {position:fixed;inset:0;z-index:3000;background:#2d1830a8;display:grid;place-items:center;padding:14px;overflow:auto}
      .customer-preview-card {background:#fff2f5;color:#12254d;border-radius:20px;box-shadow:0 22px 65px #3813226b;width:min(760px,100%);max-height:94dvh;overflow:auto}
      .customer-preview-heading {background:linear-gradient(110deg,#ff3268,#c9064d);color:white;padding:19px 24px;display:flex;align-items:center;gap:18px}
      .customer-preview-heading h2 {color:white;margin:0;font-size:clamp(21px,3.5vw,30px)}.customer-preview-heading p{margin:3px 0 0;font-size:15px}
      .customer-preview-avatar {width:52px;height:52px;flex:none;border-radius:50%;background:white;color:#ee2160;display:grid;place-items:center;font-size:34px}
      .customer-preview-close {margin-left:auto;background:transparent;border:0;color:white;font-size:30px;cursor:pointer}
      .customer-preview-content {margin:16px 20px 20px;padding:20px;border:1px solid #ffd5df;border-radius:14px;background:#fff9fb}
      .customer-preview-identity {display:flex;gap:24px;align-items:flex-start;position:relative;margin-bottom:20px}
      .customer-preview-identity>img,.customer-preview-photo-placeholder {width:132px;height:146px;object-fit:cover;border-radius:10px;flex:none;background:#dfe5ec}
      .customer-preview-photo-placeholder {display:grid;place-items:center;color:#8090a0;font-size:60px}
      .customer-preview-account {min-width:0;flex:1}.customer-preview-name {font-weight:800;font-size:clamp(24px,4vw,32px);line-height:1.1;overflow-wrap:anywhere}
      .customer-preview-type {display:inline-block;margin:9px 0;color:#d71957;border:1px solid #ff91b0;border-radius:14px;padding:5px 14px;background:#fff0f5}
      .customer-preview-account-label {display:block;margin-top:9px}.customer-preview-account-number {display:flex;align-items:center;gap:16px;font-size:clamp(23px,4vw,32px);font-weight:800;min-width:0;overflow-wrap:anywhere}
      .customer-preview-account-value {display:block;min-width:0;overflow-wrap:anywhere}
      .customer-preview-account-number button {background:#fff0f5;color:#d31352;border:1px solid #ffbad0;border-radius:10px;padding:8px 12px;cursor:pointer;font-size:23px;flex:none}
      .customer-preview-status {background:#d9f8e8;border:1px solid #8ce7b7;color:#078350;border-radius:13px;padding:7px 14px;font-weight:700;white-space:nowrap}
      .customer-preview-sections {display:grid;gap:14px}.customer-preview-section {border:1px solid #f8d4df;border-radius:12px;background:white;overflow:hidden;box-shadow:0 2px 8px #e483a21a}
      .customer-preview-section h3 {color:#12254d;background:#fff0f4;margin:0;padding:10px 17px;font-size:18px}
      .customer-preview-section dl {margin:0;padding:11px 18px}.customer-preview-section dl>div {display:grid;grid-template-columns:minmax(130px,34%) 1fr;gap:8px;line-height:1.55;overflow-wrap:anywhere}
      .customer-preview-section dt::after {content:":";float:right;padding-right:5px}.customer-preview-section dd {margin:0}.customer-preview-address {margin:0;padding:12px 18px;white-space:pre-wrap;overflow-wrap:anywhere}
      .customer-preview-bottom {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.customer-preview-bottom>.customer-preview-section:only-child{grid-column:1/-1}
      .customer-preview-actions {display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
      .customer-preview-actions button {padding:10px 18px;border-radius:9px;border:1px solid #d57c99;background:#fff;cursor:pointer}
      .customer-preview-actions button:first-child {background:#d51c57;color:white}
      @media(max-width:650px){.customer-preview-overlay{padding:0}.customer-preview-card{width:100%;max-height:100dvh;border-radius:0}.customer-preview-heading{padding:14px;gap:10px}.customer-preview-avatar{width:40px;height:40px;font-size:25px}.customer-preview-content{margin:9px;padding:12px}.customer-preview-identity{gap:12px;flex-wrap:wrap}.customer-preview-identity>img,.customer-preview-photo-placeholder{width:100px;height:112px}.customer-preview-account{min-width:0;max-width:calc(100% - 112px)}.customer-preview-account-number{font-size:16px;gap:6px;align-items:flex-start}.customer-preview-account-value{overflow-wrap:anywhere;word-break:break-all;line-height:1.3}.customer-preview-account-number button{padding:5px 7px;font-size:18px}.customer-preview-status{order:3}.customer-preview-bottom{grid-template-columns:1fr}.customer-preview-section dl>div{grid-template-columns:minmax(115px,43%) 1fr}.customer-preview-actions{flex-wrap:wrap}.customer-preview-actions button{flex:1}}
      @media print {body * {visibility:hidden!important}.customer-preview-overlay,.customer-preview-overlay * {visibility:visible!important}.customer-preview-overlay {position:absolute;inset:0;background:white;padding:0}.customer-preview-card {box-shadow:none;max-height:none;width:auto;border:0}.customer-preview-actions {display:none!important}}
    `}</style>
  </section>;
}
