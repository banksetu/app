import { useEffect, useState } from "react";
import CustomerExcelExport from "./CustomerExcelExport";
import "./LocalSyncStatus.css";
import { localModeEnabled, exportLocalBackup, restoreLocalBackup, getConflicts, resolveConflict, getLocalStatus, getLocalSnapshot, clearTemporaryLocalData, resetLocalDatabase, syncNow, pauseSync, resumeSync, getConnectionHealth } from "./core/localData";
import type { QueueOperation } from "./core/schema";
import { callBankSetuWorker } from "./workerApi";
import { androidStorageInfo, isAndroid } from "./platform/android/runtime";

type Status = { records: number; pending: number; conflicts: number; downloading: boolean; cacheLimited: boolean; syncing: boolean; paused:boolean; lastCompletedAt: number; error: string; mediaPending: number; photoIndexing?:boolean; photoUploads?:number; photoRetry?:boolean; photoError?:string };
const emptyStatus: Status = { records: 0, pending: 0, conflicts: 0, downloading: false, cacheLimited: false, syncing:false,paused:false,lastCompletedAt:0,error:"",mediaPending:0 };

export default function LocalSyncStatus({ visible = true, readOnly = false }: { visible?: boolean; readOnly?: boolean }) {
  const [conflicts, setConflicts] = useState<QueueOperation[]>([]);
  const [status, setStatus] = useState<Status>(emptyStatus);
  const [health,setHealth]=useState(getConnectionHealth);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [excelOpen,setExcelOpen] = useState(false);
  const [viewer, setViewer] = useState<"local" | "pending" | "sheet" | "storage" | null>(null);
  const [snapshot, setSnapshot] = useState<{ records: Array<{ recordId: string; customer: Record<string, unknown> }>; operations: Array<{ operationId: string; customer: Record<string, unknown>; state: string; error?: string }> }>({ records: [], operations: [] });
  const [sheetUrl, setSheetUrl] = useState("");
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [nativeStorage, setNativeStorage] = useState<{ path: string; databasePath: string; usedBytes: number; freeBytes: number | null; totalBytes: number | null } | null>(null);
  const [androidStorage,setAndroidStorage]=useState<{totalBytes:number;availableBytes:number;appDataBytes:number;appDataComplete:boolean}|null>(null);
  const [persistent,setPersistent]=useState<boolean|null>(null);

  const refresh = () => {
    if(!localModeEnabled()||sessionStorage.getItem("bankSetuWorkspaceReady")!=="true")return;
    void Promise.all([getLocalStatus(), getConflicts(), getLocalSnapshot()]).then(([nextStatus, nextConflicts, nextSnapshot]) => {
      setStatus(nextStatus); setConflicts(nextConflicts); setSnapshot(nextSnapshot);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Local database could not be read."));
    setHealth(getConnectionHealth());
    if (window.bankSetuDesktop?.storage) void window.bankSetuDesktop.storage().then(result => setNativeStorage(result)).catch(() => setNativeStorage(null));
    if (navigator.storage?.estimate) void navigator.storage.estimate().then(result => setStorage({ used: result.usage || 0, quota: result.quota || 0 })).catch(()=>setStorage({used:0,quota:0}));
    if (isAndroid()) void androidStorageInfo().then(setAndroidStorage).catch(()=>setAndroidStorage(null));
  };

  useEffect(() => {
    const changed=()=>{if(visible)refresh();};
    window.addEventListener("banksetu-sync-change",changed);window.addEventListener("banksetu-workspace-change",changed);changed();
    if(visible && sessionStorage.getItem("bankSetuConnectionMode")!=="demo"){
    void callBankSetuWorker<{ spreadsheetId?: string }>("/get-google-setup", {}).then(config => {
      const id = String(config.spreadsheetId || ""); setSheetUrl(id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : "");
    }).catch(() => undefined);
    }
    return()=>{window.removeEventListener("banksetu-sync-change",changed);window.removeEventListener("banksetu-workspace-change",changed);};
  },[visible]);
  useEffect(()=>{if(!isAndroid()||!navigator.storage?.persist)return;void navigator.storage.persist().then(setPersistent).catch(()=>setPersistent(false));},[]);

  if (!visible) return null;
  const bridgeDownloadName=sessionStorage.getItem("bankSetuConnectionMode")==="option-b"?"BankSetu-Client-Code.gs":"BankSetu-Master-Code.gs";
  if (!localModeEnabled()) return <aside aria-label="Local database sync" style={styles.shell}><h2 style={styles.title}>Sync &amp; Backup</h2><p>Local sync चालू करने के लिए existing workspace Apps Script में updated Code.gs लगाकर उसी deployment का नया version deploy करें, फिर login करें।</p><a href="/client-bridge/Code.gs?revision=v8-20261014" download={bridgeDownloadName} style={styles.link}>Download updated Code.gs</a></aside>;

  if(sessionStorage.getItem("bankSetuConnectionMode")==="demo") return <aside aria-label="Legacy demo local data" className="sync-center"><header className="sync-header"><div><p>LEGACY SAMPLE DATA</p><h2>Previous Local Demo</h2><span>{status.records} older sample records on this device.</span></div></header><section className="sync-body"><p>Reconnect your verified tenant workspace for the current Demo license. Existing local sample records are retained.</p><button type="button" className="backup-action" onClick={()=>void exportLocalBackup().catch(reason=>setError(reason instanceof Error?reason.message:"Sample backup failed."))}>Back Up Sample Data</button>{error&&<p role="alert">{error}</p>}</section></aside>;

  if (readOnly) return <aside aria-label="Local database backup" className="sync-center"><header className="sync-header"><div><p>DATA CONTROL CENTER</p><h2>Read-Only Backup</h2><span>Existing customer data and pending operations remain on this device.</span></div></header><section className="sync-body"><p>{status.records} local customer records · {status.pending} pending operations</p><button type="button" className="backup-action" onClick={() => void exportLocalBackup().catch(reason => setError(reason instanceof Error ? reason.message : "Backup failed."))}>◉ Backup Now</button>{error && <p role="alert">{error}</p>}</section></aside>;

  const runSync = () => {
    const notice=(type:string,title:string,message:string)=>{const event=new Event("banksetu-notification") as Event & {detail:{type:string;title:string;message:string}};event.detail={type,title,message};window.dispatchEvent(event);};
    setBusy(true);setError("");notice("progress","Sync in progress","Checking this device and its Google Sheet.");
    void syncNow().then(async()=>{const next=await getLocalStatus();notice(next.pending||next.photoError?"warning":"success",next.pending?"Sync pending":next.photoError?"Photo sync needs attention":"Sync completed",next.pending?`${next.pending} changes still waiting for Google confirmation.`:next.photoError?next.photoError:"Customer records reconciled with Google Sheet.");})
      .catch(reason=>{const message=reason instanceof Error?reason.message:String(reason);setError(message);notice("error","Sync failed",message);})
      .finally(()=>{setBusy(false);refresh();});
  };
  const clearTemporary = () => {
    if (!window.confirm("Clear downloaded temporary photo previews on this device? Customer records, original files and pending sync changes will remain.")) return;
    setBusy(true);setError("");
    void clearTemporaryLocalData().then(count => {
      const event=new Event("banksetu-notification") as Event & {detail:{type:string;title:string;message:string}};
      event.detail={type:"success",title:"Temporary data cleared",message:`${count} downloaded photo preview(s) cleared. Customer records and pending sync are safe.`};window.dispatchEvent(event);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Temporary data could not be cleared."))
      .finally(()=>{setBusy(false);refresh();});
  };
  const resetLocal = () => {
    if(!window.confirm("Reset this tenant's local customer database on your devices? Google Sheet and Drive records remain. Pending or unsynced changes will block the reset; back them up and resolve them first. Other online devices apply it on their next sync."))return;
    setBusy(true);setError("");
    void resetLocalDatabase().then(count=>{
      const event=new Event("banksetu-notification") as Event & {detail:{type:string;title:string;message:string}};
      event.detail={type:"success",title:"Local data refreshed",message:`Shared reset applied and ${count} customer records downloaded from Google Sheet.`};window.dispatchEvent(event);
    }).catch(reason=>setError(reason instanceof Error?reason.message:"Local reset could not be completed."))
      .finally(()=>{setBusy(false);refresh();});
  };
  const formatBytes = (bytes: number | null | undefined) => { if (!bytes || bytes < 0) return ""; const units = ["B", "KB", "MB", "GB", "TB"]; let value = bytes; let unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; } return (value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)) + " " + units[unit]; };
  const cards = [
    { key: "local" as const, label: "Local data", value: String(status.records), hint: "इस device के local database में records", action: "Click here to see" },
    { key: "pending" as const, label: "Upload pending", value: String(status.pending), hint: "Google Sheet पर भेजने के लिए बाकी", action: "Click here to see" },
    { key: "sheet" as const, label: "Google Sheet data", value: status.syncing || status.downloading ? "Syncing…" : status.lastCompletedAt ? "Downloaded" : "Waiting for sync", hint: status.photoError ? `Photo sync attention: ${status.photoError}` : status.mediaPending ? `Photo Pending: ${status.mediaPending} · ${!navigator.onLine?"Waiting for Network":status.photoRetry?"Retry Required":status.syncing?(status.photoUploads?"Uploading Changed Photos":"Downloading Changed Photos"):"Pending Photo Sync"}` : status.photoIndexing ? "Initial Photo Indexing" : status.lastCompletedAt ? `Photo Sync Complete · Last download: ${new Date(status.lastCompletedAt).toLocaleString()}` : "पुराना डेटा इस device पर अपने-आप डाउनलोड होगा", action: "Click here to see" },
    { key: "storage" as const, label: "Local storage", value: androidStorage ? formatBytes(androidStorage.availableBytes)+" device free" : nativeStorage?.freeBytes ? formatBytes(nativeStorage.freeBytes) + " free" : storage.quota ? formatBytes(Math.max(0,storage.quota-storage.used))+" WebView quota left" : "Storage unavailable", hint: androidStorage?"Device space and WebView quota are separate":nativeStorage?"SQLite local database · "+formatBytes(nativeStorage.usedBytes)+" used": "Tap for accurate storage details", action: "Click here to see" },
  ];
  const viewerTitle = viewer === "local" ? "Local database records" : viewer === "pending" ? "Upload pending queue" : viewer === "storage" ? "Local storage status" : "Google Sheet data";
  const viewerItems = viewer === "local" ? snapshot.records : viewer === "pending" ? snapshot.operations : [];
  const statusText=status.paused?"Background sync paused on this device":status.syncing||status.downloading?"Sync in progress":status.pending?`${status.pending} upload pending`:status.lastCompletedAt?"Last sync completed":"Waiting for first sync";
  const cardIcons:Record<string,string>={local:"💻",pending:"☁️",sheet:"📊",storage:"💾"};
  return <aside aria-label="Local database sync" className="sync-center">
    <header className="sync-header"><div className="sync-header-icon">☁️</div><div><p>DATA CONTROL CENTER</p><h2>Sync &amp; Backup</h2><span>Local-first storage · Google Sheet sync · backup and restore</span></div><div className="sync-header-actions"><a href="/client-bridge/Code.gs?revision=v8-20261014" download={bridgeDownloadName}>⬇ Download Code.gs</a><button disabled={busy} onClick={runSync}>{busy ? "Syncing…" : "↻ Sync Now"}</button><button type="button" disabled={busy} onClick={()=>{if(status.paused)resumeSync();else pauseSync();refresh();}}>{status.paused?"▶ Resume Sync":"⏸ Pause Sync"}</button></div></header>
    <section className="sync-body"><div className="sync-summary"><div><b>✓</b><span><strong>Your data protection</strong><small>Local storage with verified Google Sheet sync and backup.</small></span></div><em className={error||status.error?"error":status.pending?"pending":""}>{statusText}</em></div>
    <details><summary>System Health: {health.state === "healthy" ? "Healthy" : health.state === "recovering" ? "Recovering" : "Attention Required"}</summary><p>Recovery attempts use bounded retries. Customer records and pending operations remain in local storage.</p>{health.history.length>0 && <ol>{health.history.map((entry,index)=><li key={`${entry.at}-${index}`}>{new Date(entry.at).toLocaleString()} · {entry.category} · {entry.action} · {entry.result}</li>)}</ol>}</details>
    <div className="sync-card-grid">{cards.map(card => <article key={card.key} className={`sync-card sync-card-${card.key}`}><div className="sync-card-icon">{cardIcons[card.key]}</div><div className="sync-card-copy"><span>{card.label}</span><p>{card.hint}</p></div><strong>{card.value}</strong><button onClick={() => card.key === "sheet" && sheetUrl ? window.open(sheetUrl, "_blank", "noopener,noreferrer") : setViewer(card.key)}>{card.action} ›</button></article>)}</div>
    {(androidStorage||storage.quota>0)&&<section className="sync-storage-details" aria-label="Device storage details"><strong>Local Storage Health: {androidStorage?.availableBytes != null && androidStorage.availableBytes<200*1024*1024 || storage.quota>0 && storage.quota-storage.used<100*1024*1024 ? "Low space · back up now" : "Available"}</strong><div><span>Device total: {androidStorage?formatBytes(androidStorage.totalBytes):"Unavailable"}</span><span>Device available: {androidStorage?formatBytes(androidStorage.availableBytes):"Unavailable"}</span><span>Bank Setu app data: {androidStorage?(androidStorage.appDataComplete?"About ":"At least ")+formatBytes(androidStorage.appDataBytes):nativeStorage?formatBytes(nativeStorage.usedBytes):"Unavailable"}</span><span>WebView/IndexedDB quota: {storage.quota?formatBytes(storage.quota):"Unavailable"}</span><span>WebView origin usage: {storage.quota?formatBytes(storage.used):"Unavailable"}</span><span>Pending sync: {status.pending}</span></div>{isAndroid()&&<small>Persistent browser storage: {persistent===null?"Checking":persistent?"Granted":"Not granted"}. Device space and WebView quota are separate; customer records and queued edits are never removed automatically.</small>}</section>}
    {(error || status.error || status.photoError || status.conflicts > 0) && <div style={styles.errorCard}><strong>Sync attention needed</strong><p>{error || status.error || status.photoError || `${status.conflicts} record(s) need review.`}</p>{status.photoError?.includes("current Code.gs")&&<a href="/client-bridge/Code.gs?revision=v8-20261014" download={bridgeDownloadName} style={styles.link}>⬇ Download current Code.gs</a>}</div>}
    <div className="sync-actions"><button type="button" className="backup-action" onClick={() => void exportLocalBackup().catch(reason => setError(reason.message))}>◉ Backup Now</button><button type="button" className="excel-action" onClick={() => setExcelOpen(true)}>▣ Export to Excel</button><label className="restore-action"><span>Restore Backup</span><input aria-label="Restore local backup" type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!window.confirm("Merge this backup into the current workspace?")) return; void file.text().then(restoreLocalBackup).then(report => setError(`Restored ${report.records} records and ${report.operations} operations.`)).catch(reason => setError(reason.message)); }} /></label></div>
    <div className="sync-maintenance"><button type="button" disabled={busy} onClick={clearTemporary}>🗑 Clear Temporary Data</button>{["client_admin","master_owner","admin"].includes(sessionStorage.getItem("bankSetuAccountRole")||"") && <button type="button" disabled={busy} onClick={resetLocal}>🛡 Reset Local Database &amp; Temporary Data</button>}</div>
    {excelOpen && <CustomerExcelExport close={() => setExcelOpen(false)} />}
    {status.cacheLimited && <p style={styles.notice}>Offline cache limit reached. Pending edits remain saved; older cloud records can still be searched online.</p>}
    {viewer && <div role="dialog" aria-modal="true" style={styles.modal}><div style={styles.modalBox}><div style={styles.headingRow}><h3 style={{ margin: 0 }}>{viewerTitle}</h3><button onClick={() => setViewer(null)} style={styles.close}>×</button></div>{viewer === "sheet" ? <p>Google Sheet को नए tab में खोलने के लिए ऊपर वाला button इस्तेमाल करें।</p> : viewer === "storage" ? <p>{androidStorage?<><b>Device total:</b> {formatBytes(androidStorage.totalBytes)}<br/><b>Device available:</b> {formatBytes(androidStorage.availableBytes)}<br/><b>Bank Setu app data:</b> {androidStorage.appDataComplete?"About ":"At least "}{formatBytes(androidStorage.appDataBytes)}<br/></>:nativeStorage?<>SQLite local database: <code>{nativeStorage.databasePath}</code><br/>Drive free: {formatBytes(nativeStorage.freeBytes)}{nativeStorage.totalBytes?` of ${formatBytes(nativeStorage.totalBytes)}`:""}<br/>Database used: {formatBytes(nativeStorage.usedBytes)}<br/></>:null}<b>WebView quota:</b> {storage.quota?formatBytes(storage.quota):"Unavailable"}<br/><b>WebView origin usage:</b> {storage.quota?formatBytes(storage.used):"Unavailable"}<br/><b>Pending sync:</b> {status.pending}</p> : viewerItems.length ? <div style={styles.list}>{viewerItems.map(item => <pre key={"recordId" in item ? item.recordId : item.operationId}>{JSON.stringify(item, null, 2)}</pre>)}</div> : <p>इस समय कोई data नहीं है।</p>}<button onClick={() => setViewer(null)} style={styles.secondary}>Close</button></div></div>}
    {conflicts.length > 0 && ["client_admin", "master_owner", "admin"].includes(sessionStorage.getItem("bankSetuAccountRole") || "") && <details style={{ marginTop: 12 }}><summary>{conflicts.length} conflict/review item(s)</summary>{conflicts.map(op => <div key={op.operationId} style={styles.conflict}><strong>{String(op.customer.name || op.recordId)}</strong><span>{op.error}</span><button onClick={() => { if (window.confirm("Keep this local version and retry?")) void resolveConflict(op.operationId, "local").then(refresh).catch(reason => setError(reason.message)); }}>Keep local / retry</button>{op.remoteCustomer && <button onClick={() => { if (window.confirm("Use the Google version?")) void resolveConflict(op.operationId, "cloud").then(refresh).catch(reason => setError(reason.message)); }}>Use Google version</button>}</div>)}</details>}
    <footer className="sync-protection"><div>🛡️</div><span><strong>Backup &amp; Sync Protection</strong><p>Local-first storage, automatic retry, backup and tenant data security remain active.</p></span></footer></section>
  </aside>;
}

const styles: Record<string, React.CSSProperties> = {
  shell: { background: "linear-gradient(135deg,#09212b,#103744)", color: "#eef7f7", padding: 22, borderRadius: 18, boxShadow: "0 18px 50px rgba(0,0,0,.18)" },
  headingRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }, headingActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }, eyebrow: { margin: 0, color: "#7de7d0", fontSize: 11, letterSpacing: 1.6, fontWeight: 800 }, title: { margin: "5px 0", color: "#fff", fontSize: 26 }, sub: { margin: 0, opacity: .78 }, grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 22 }, card: { background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 16, minHeight: 130 }, cardTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }, cardLabel: { fontWeight: 800 }, value: { color: "#84efd1", fontSize: 24 }, hint: { minHeight: 38, opacity: .78, fontSize: 13 }, primary: { background: "#62e2c4", color: "#06242a", border: 0, borderRadius: 9, padding: "11px 18px", fontWeight: 800 }, viewButton: { width: "100%", border: "1px solid #66ddc3", color: "#b7f8e8", background: "transparent", borderRadius: 8, padding: 9, cursor: "pointer" }, errorCard: { marginTop: 18, padding: 16, borderRadius: 12, background: "rgba(168,55,63,.35)", border: "1px solid #f28a8a" }, actions: { display: "flex", gap: 10, flexWrap: "wrap" }, restore: { display: "inline-flex", gap: 8, alignItems: "center", background: "#f0c674", color: "#2d1d00", padding: "8px 12px", borderRadius: 8, fontWeight: 700 }, link: { color: "#84efd1" }, notice: { opacity: .8 }, modal: { position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", padding: 20 }, modalBox: { background: "#102d38", borderRadius: 16, padding: 20, width: "min(800px,100%)", maxHeight: "85vh", overflow: "auto" }, close: { background: "transparent", border: 0, color: "#fff", fontSize: 24 }, secondary: { marginTop: 16, padding: "9px 14px", borderRadius: 8 }, list: { display: "grid", gap: 8 }, conflict: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.12)" }
};
