import { useEffect, useState } from "react";
import CustomerExcelExport from "./CustomerExcelExport";
import "./LocalSyncStatus.css";
import { localModeEnabled, exportLocalBackup, restoreLocalBackup, getConflicts, resolveConflict, getLocalStatus, getLocalSnapshot, clearTemporaryLocalData, resetLocalDatabase, syncNow, pauseSync, resumeSync } from "./core/localData";
import type { QueueOperation } from "./core/schema";
import { callBankSetuWorker } from "./workerApi";

type Status = { records: number; pending: number; conflicts: number; downloading: boolean; cacheLimited: boolean; syncing: boolean; paused:boolean; lastCompletedAt: number; error: string; mediaPending: number };
const emptyStatus: Status = { records: 0, pending: 0, conflicts: 0, downloading: false, cacheLimited: false, syncing:false,paused:false,lastCompletedAt:0,error:"",mediaPending:0 };

export default function LocalSyncStatus({ visible = true }: { visible?: boolean }) {
  const [conflicts, setConflicts] = useState<QueueOperation[]>([]);
  const [status, setStatus] = useState<Status>(emptyStatus);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [excelOpen,setExcelOpen] = useState(false);
  const [viewer, setViewer] = useState<"local" | "pending" | "sheet" | "storage" | null>(null);
  const [snapshot, setSnapshot] = useState<{ records: Array<{ recordId: string; customer: Record<string, unknown> }>; operations: Array<{ operationId: string; customer: Record<string, unknown>; state: string; error?: string }> }>({ records: [], operations: [] });
  const [sheetUrl, setSheetUrl] = useState("");
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [nativeStorage, setNativeStorage] = useState<{ path: string; databasePath: string; usedBytes: number; freeBytes: number | null; totalBytes: number | null } | null>(null);

  const refresh = () => {
    if(!localModeEnabled()||sessionStorage.getItem("bankSetuWorkspaceReady")!=="true")return;
    void Promise.all([getLocalStatus(), getConflicts(), getLocalSnapshot()]).then(([nextStatus, nextConflicts, nextSnapshot]) => {
      setStatus(nextStatus); setConflicts(nextConflicts); setSnapshot(nextSnapshot);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Local database could not be read."));
    if (window.bankSetuDesktop?.storage) void window.bankSetuDesktop.storage().then(result => setNativeStorage(result)).catch(() => setNativeStorage(null));
    else if (navigator.storage?.estimate) void navigator.storage.estimate().then(result => setStorage({ used: result.usage || 0, quota: result.quota || 0 }));
  };

  useEffect(() => {
    const changed=()=>{if(visible)refresh();};
    window.addEventListener("banksetu-sync-change",changed);window.addEventListener("banksetu-workspace-change",changed);changed();
    if(visible){
    void callBankSetuWorker<{ spreadsheetId?: string }>("/get-google-setup", {}).then(config => {
      const id = String(config.spreadsheetId || ""); setSheetUrl(id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : "");
    }).catch(() => undefined);
    }
    return()=>{window.removeEventListener("banksetu-sync-change",changed);window.removeEventListener("banksetu-workspace-change",changed);};
  },[visible]);

  if (!visible) return null;
  if (!localModeEnabled()) return <aside aria-label="Local database sync" style={styles.shell}><h2 style={styles.title}>Sync &amp; Backup</h2><p>Local sync चालू करने के लिए existing Master Apps Script में updated Code.gs लगाकर उसी deployment का नया version deploy करें, फिर login करें।</p><a href="/client-bridge/Code.gs" download="BankSetu-Master-Code.gs" style={styles.link}>Download updated Master Code.gs</a></aside>;

  const runSync = () => {
    const notice=(type:string,title:string,message:string)=>{const event=new Event("banksetu-notification") as Event & {detail:{type:string;title:string;message:string}};event.detail={type,title,message};window.dispatchEvent(event);};
    setBusy(true);setError("");notice("progress","Sync in progress","Checking this device and its Google Sheet.");
    void syncNow().then(async()=>{const next=await getLocalStatus();notice(next.pending?"warning":"success",next.pending?"Sync pending":"Sync completed",next.pending?`${next.pending} changes still waiting for Google confirmation.`:"Customer records reconciled with Google Sheet.");})
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
    { key: "sheet" as const, label: "Google Sheet data", value: status.syncing || status.downloading ? "Syncing…" : status.lastCompletedAt ? "Downloaded" : "Waiting for sync", hint: status.mediaPending ? `${status.mediaPending} customer photos बाकी हैं` : status.lastCompletedAt ? `Last download: ${new Date(status.lastCompletedAt).toLocaleString()}` : "पुराना डेटा इस device पर अपने-आप डाउनलोड होगा", action: "Click here to see" },
    { key: "storage" as const, label: "Local storage", value: nativeStorage?.freeBytes ? formatBytes(nativeStorage.freeBytes) + " free" : storage.quota ? `${Math.max(0, Math.round((storage.quota - storage.used) / 1024 / 1024))} MB free` : "Device storage", hint: nativeStorage ? "SQLite local database · " + formatBytes(nativeStorage.usedBytes) + " used" : storage.quota ? `${Math.round(storage.used / 1024 / 1024)} MB browser database used` : "Local database storage", action: "Click here to see" },
  ];
  const viewerTitle = viewer === "local" ? "Local database records" : viewer === "pending" ? "Upload pending queue" : viewer === "storage" ? "Local storage status" : "Google Sheet data";
  const viewerItems = viewer === "local" ? snapshot.records : viewer === "pending" ? snapshot.operations : [];
  const statusText=status.paused?"Background sync paused on this device":status.syncing||status.downloading?"Sync in progress":status.pending?`${status.pending} upload pending`:status.lastCompletedAt?"Last sync completed":"Waiting for first sync";
  const cardIcons:Record<string,string>={local:"💻",pending:"☁️",sheet:"📊",storage:"💾"};
  return <aside aria-label="Local database sync" className="sync-center">
    <header className="sync-header"><div className="sync-header-icon">☁️</div><div><p>DATA CONTROL CENTER</p><h2>Sync &amp; Backup</h2><span>Local-first storage · Google Sheet sync · backup and restore</span></div><div className="sync-header-actions"><a href="/client-bridge/Code.gs" download="BankSetu-Master-Code.gs">⬇ Download Code.gs</a><button disabled={busy} onClick={runSync}>{busy ? "Syncing…" : "↻ Sync Now"}</button><button type="button" disabled={busy} onClick={()=>{if(status.paused)resumeSync();else pauseSync();refresh();}}>{status.paused?"▶ Resume Sync":"⏸ Pause Sync"}</button></div></header>
    <section className="sync-body"><div className="sync-summary"><div><b>✓</b><span><strong>Your data protection</strong><small>Local storage with verified Google Sheet sync and backup.</small></span></div><em className={error||status.error?"error":status.pending?"pending":""}>{statusText}</em></div>
    <div className="sync-card-grid">{cards.map(card => <article key={card.key} className={`sync-card sync-card-${card.key}`}><div className="sync-card-icon">{cardIcons[card.key]}</div><div className="sync-card-copy"><span>{card.label}</span><p>{card.hint}</p></div><strong>{card.value}</strong><button onClick={() => card.key === "sheet" && sheetUrl ? window.open(sheetUrl, "_blank", "noopener,noreferrer") : setViewer(card.key)}>{card.action} ›</button></article>)}</div>
    {(error || status.error || status.conflicts > 0) && <div style={styles.errorCard}><strong>Sync attention needed</strong><p>{error || status.error || `${status.conflicts} record(s) need review.`}</p></div>}
    <div className="sync-actions"><button type="button" className="backup-action" onClick={() => void exportLocalBackup().catch(reason => setError(reason.message))}>◉ Backup Now</button><button type="button" className="excel-action" onClick={() => setExcelOpen(true)}>▣ Export to Excel</button><label className="restore-action"><span>Restore Backup</span><input aria-label="Restore local backup" type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!window.confirm("Merge this backup into the current workspace?")) return; void file.text().then(restoreLocalBackup).then(report => setError(`Restored ${report.records} records and ${report.operations} operations.`)).catch(reason => setError(reason.message)); }} /></label></div>
    <div className="sync-maintenance"><button type="button" disabled={busy} onClick={clearTemporary}>🗑 Clear Temporary Data</button>{["client_admin","master_owner","admin"].includes(sessionStorage.getItem("bankSetuAccountRole")||"") && <button type="button" disabled={busy} onClick={resetLocal}>🛡 Reset Local Database &amp; Temporary Data</button>}</div>
    {excelOpen && <CustomerExcelExport close={() => setExcelOpen(false)} />}
    {status.cacheLimited && <p style={styles.notice}>Offline cache limit reached. Pending edits remain saved; older cloud records can still be searched online.</p>}
    {viewer && <div role="dialog" aria-modal="true" style={styles.modal}><div style={styles.modalBox}><div style={styles.headingRow}><h3 style={{ margin: 0 }}>{viewerTitle}</h3><button onClick={() => setViewer(null)} style={styles.close}>×</button></div>{viewer === "sheet" ? <p>Google Sheet को नए tab में खोलने के लिए ऊपर वाला button इस्तेमाल करें।</p> : viewer === "storage" ? <p>{nativeStorage ? <>SQLite local database: <code>{nativeStorage.databasePath}</code><br />Drive free: {formatBytes(nativeStorage.freeBytes)}{nativeStorage.totalBytes ? ` of ${formatBytes(nativeStorage.totalBytes)}` : ""}<br />Database used: {formatBytes(nativeStorage.usedBytes)}</> : storage.quota ? `${Math.round(storage.used / 1024 / 1024)} MB browser database used of ${Math.round(storage.quota / 1024 / 1024)} MB quota.` : "Storage estimate इस device पर उपलब्ध नहीं है।"}</p> : viewerItems.length ? <div style={styles.list}>{viewerItems.map(item => <pre key={"recordId" in item ? item.recordId : item.operationId}>{JSON.stringify(item, null, 2)}</pre>)}</div> : <p>इस समय कोई data नहीं है।</p>}<button onClick={() => setViewer(null)} style={styles.secondary}>Close</button></div></div>}
    {conflicts.length > 0 && ["client_admin", "master_owner", "admin"].includes(sessionStorage.getItem("bankSetuAccountRole") || "") && <details style={{ marginTop: 12 }}><summary>{conflicts.length} conflict/review item(s)</summary>{conflicts.map(op => <div key={op.operationId} style={styles.conflict}><strong>{String(op.customer.name || op.recordId)}</strong><span>{op.error}</span><button onClick={() => { if (window.confirm("Keep this local version and retry?")) void resolveConflict(op.operationId, "local").then(refresh).catch(reason => setError(reason.message)); }}>Keep local / retry</button>{op.remoteCustomer && <button onClick={() => { if (window.confirm("Use the Google version?")) void resolveConflict(op.operationId, "cloud").then(refresh).catch(reason => setError(reason.message)); }}>Use Google version</button>}</div>)}</details>}
    <footer className="sync-protection"><div>🛡️</div><span><strong>Backup &amp; Sync Protection</strong><p>Local-first storage, automatic retry, backup and tenant data security remain active.</p></span></footer></section>
  </aside>;
}

const styles: Record<string, React.CSSProperties> = {
  shell: { background: "linear-gradient(135deg,#09212b,#103744)", color: "#eef7f7", padding: 22, borderRadius: 18, boxShadow: "0 18px 50px rgba(0,0,0,.18)" },
  headingRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }, headingActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }, eyebrow: { margin: 0, color: "#7de7d0", fontSize: 11, letterSpacing: 1.6, fontWeight: 800 }, title: { margin: "5px 0", color: "#fff", fontSize: 26 }, sub: { margin: 0, opacity: .78 }, grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 22 }, card: { background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 16, minHeight: 130 }, cardTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }, cardLabel: { fontWeight: 800 }, value: { color: "#84efd1", fontSize: 24 }, hint: { minHeight: 38, opacity: .78, fontSize: 13 }, primary: { background: "#62e2c4", color: "#06242a", border: 0, borderRadius: 9, padding: "11px 18px", fontWeight: 800 }, viewButton: { width: "100%", border: "1px solid #66ddc3", color: "#b7f8e8", background: "transparent", borderRadius: 8, padding: 9, cursor: "pointer" }, errorCard: { marginTop: 18, padding: 16, borderRadius: 12, background: "rgba(168,55,63,.35)", border: "1px solid #f28a8a" }, actions: { display: "flex", gap: 10, flexWrap: "wrap" }, restore: { display: "inline-flex", gap: 8, alignItems: "center", background: "#f0c674", color: "#2d1d00", padding: "8px 12px", borderRadius: 8, fontWeight: 700 }, link: { color: "#84efd1" }, notice: { opacity: .8 }, modal: { position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", padding: 20 }, modalBox: { background: "#102d38", borderRadius: 16, padding: 20, width: "min(800px,100%)", maxHeight: "85vh", overflow: "auto" }, close: { background: "transparent", border: 0, color: "#fff", fontSize: 24 }, secondary: { marginTop: 16, padding: "9px 14px", borderRadius: 8 }, list: { display: "grid", gap: 8 }, conflict: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.12)" }
};
