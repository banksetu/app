import { useEffect, useState } from "react";
import { startUpdatePolling } from "./platform/updatePolling";
import { downloadAndroidUpdate, isAndroid } from "./platform/android/runtime";
import { checkAndroidUpdate } from "./platform/android/updates";
import type { ReleaseChangelog } from "./platform/releaseNotes";
import type { UpdateManifest } from "./platform/updateManifest";
import { notifySystem } from "./platform/systemNotifications";
import "./SoftwareUpdateNotice.css";

declare const __APP_VERSION__: string;

type DesktopBridge = {
  version(): Promise<string>;
  checkUpdate(): Promise<unknown>;
  installUpdate(): Promise<void>;
  onUpdateProgress(callback: (progress: { percent?: number;transferred?:number;total?:number;bytesPerSecond?:number }) => void): () => void;
  onUpdateReady?(callback:()=>void):()=>void;
};

type UpdateNoticeState = {
  available: boolean;
  latestVersion: string;
  downloadUrl: string;
  notes: string;
  changelog?: ReleaseChangelog;
  releaseDate?: string;
  platform: "web" | "android" | "windows";
  currentVersion:string;
};

const desktopBridge = () =>
  (window as Window & { bankSetuDesktop?: DesktopBridge }).bankSetuDesktop;

function compareVersions(latest: string, current: string) {
  const a = latest.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = current.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] || 0;
    const right = b[index] || 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

async function findUpdate(): Promise<UpdateNoticeState> {
  const current = __APP_VERSION__;

  if (isAndroid()) {
    const result = await checkAndroidUpdate();
    return {
      available: result.available,
      latestVersion: result.latestVersion,
      downloadUrl: result.downloadUrl,
      notes: result.notes,
      changelog: result.changelog,
      releaseDate: result.releaseDate,
      platform: "android",
      currentVersion:result.currentVersion,
    };
  }

  const desktop = desktopBridge();
  if (desktop) {
    const [installedVersion, rawResult] = await Promise.all([
      desktop.version(),
      desktop.checkUpdate(),
    ]);
    const result = rawResult as { latestVersion?: string; notes?: string; changelog?: ReleaseChangelog; releaseDate?: string };
    const latestVersion = String(result.latestVersion || installedVersion);
    return {
      available: compareVersions(latestVersion, installedVersion) > 0,
      latestVersion,
      downloadUrl: "",
      notes: String(result.notes || ""),
      changelog: result.changelog,
      releaseDate: result.releaseDate,
      platform: "windows",
      currentVersion:installedVersion,
    };
  }

  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Update manifest unavailable.");
  const manifest = (await response.json()) as UpdateManifest;
  const latestVersion = String(manifest.latestVersion || current).trim();
  return {
    available: compareVersions(latestVersion, current) > 0,
    latestVersion,
    downloadUrl: String(manifest.downloadUrl || "").trim(),
    notes: String(manifest.notes || "").trim(),
    changelog: manifest.changelog?.windows?.version === latestVersion ? manifest.changelog.windows : undefined,
    releaseDate: manifest.releaseDate,
    platform: "web",
    currentVersion:current,
  };
}

export default function SoftwareUpdateNotice() {
  const [notice, setNotice] = useState<UpdateNoticeState | null>(null);
  const [message, setMessage] = useState("");
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [bytes,setBytes]=useState<{downloaded:number;total:number;speed:number}|null>(null);
  const [stage,setStage]=useState<'ready'|'downloading'|'install-ready'|'installing'|'error'>('ready');

  useEffect(() => {
    const bridge = desktopBridge();
    const stop=bridge?.onUpdateProgress?.(event => {
      const percent=Number(event.percent);
      setProgress(Number.isFinite(percent)?Math.min(100,Math.max(0,percent)):null);
      setBytes({downloaded:Number(event.transferred)||0,total:Number(event.total)||0,speed:Number(event.bytesPerSecond)||0});
      setStage('downloading');setMessage('Downloading Windows update…');
    });
    const ready=bridge?.onUpdateReady?.(()=>{setStage('install-ready');setMessage('Download verified by the updater. Ready to install.');});
    return ()=>{stop?.();ready?.();};
  }, []);

  useEffect(() => {
    let active = true;
    const stop = startUpdatePolling(async () => {
      const result = await findUpdate();
      if (!active) return;
      if (!result.available) { setNotice(null); return; }
      let dismissed = "";
      try { dismissed = sessionStorage.getItem("bankSetuUpdateDismissed") || ""; } catch { /* Storage is optional. */ }
      if (dismissed !== result.latestVersion){setNotice(result);if(result.platform!=='web')notifySystem({key:`update:${result.platform}:${result.latestVersion}`,title:'Bank Setu update available',body:`Version ${result.latestVersion} is ready to download.`,page:'dashboard',category:'update',cooldownMs:24*60*60_000});}
    });
    return () => { active = false; stop(); };
  }, []);

  if (!notice) return null;
  const groups = Object.entries(notice.changelog?.categories || {}).filter(([,items]) => Array.isArray(items) && items.length);

  const dismiss = () => {
    try { sessionStorage.setItem("bankSetuUpdateDismissed", notice.latestVersion); } catch { /* Storage is optional. */ }
    setNotice(null);
  };

  const install = async () => {
    if (installing) return;
    setInstalling(true);
    setProgress(null);setBytes(null);setStage('downloading');setMessage('');
    let handedToInstaller = false;
    try {
      if (notice.platform === "android") {
        setMessage("Downloading Android update…");
        let last={at:Date.now(),bytes:0};
        await downloadAndroidUpdate(notice.downloadUrl,(percent,transfer)=>{setProgress(percent<0?null:percent);if(transfer){const now=Date.now(),elapsed=(now-last.at)/1000;const speed=elapsed>=.5?Math.max(0,(transfer.downloaded-last.bytes)/elapsed):0;if(elapsed>=.5)last={at:now,bytes:transfer.downloaded};setBytes({downloaded:transfer.downloaded,total:transfer.total,speed});}setMessage('Downloading Android update…');});
        setStage('installing');
        setMessage("Download complete. Android installer opened; approve the system installation prompt.");
        handedToInstaller = true;
        return;
      }
      if (notice.platform === "windows" && desktopBridge()) {
        setMessage("Downloading Windows update…");
        await desktopBridge()!.installUpdate();
        setStage('installing');
        setMessage("Update downloaded. Installing and restarting Bank Setu…");
        handedToInstaller = true;
        return;
      }
      if (notice.downloadUrl) {
        window.open(notice.downloadUrl, "_blank", "noopener,noreferrer");
        return;
      }
      window.location.reload();
    } catch (error) {
      setStage('error');
      setMessage(
        error instanceof Error
          ? error.message
          : "The update could not be installed. Your local data is retained."
      );
    } finally { if (!handedToInstaller) setInstalling(false); }
  };

  const formatBytes=(value:number)=>value>=1024*1024?`${(value/1024/1024).toFixed(1)} MB`:`${Math.round(value/1024)} KB`;
  return <div className="update-backdrop" role="presentation"><aside className="update-dialog" role="dialog" aria-modal="true" aria-label="Bank Setu update available">
    <button type="button" className="update-close" aria-label="Close update popup" onClick={dismiss}>×</button>
    <header className="update-header"><img src="/banksetu-icon.png" alt="Bank Setu"/><div><h2>Bank Setu Update Available</h2><p>A new version is ready with improvements and new features.</p></div></header>
    <div className="update-versions"><div><small>Current version</small><strong>v{notice.currentVersion||'Unknown'}</strong></div><span aria-hidden="true">→</span><div><small>Latest version</small><strong>v{notice.latestVersion}</strong></div></div>
    {(installing||progress!==null||stage==='error')&&<div className="update-progress"><div className="update-progress-heading"><strong>{stage==='error'?'Download failed':stage==='install-ready'?'Ready to install':stage==='installing'?'Opening installer…':'Downloading update…'}</strong>{progress!==null&&<strong>{Math.round(progress)}%</strong>}</div>{progress!==null&&<div role="progressbar" aria-label="Update download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="update-track"><div style={{width:`${progress}%`}}/></div>}{bytes&&<div className="update-transfer"><span>{formatBytes(bytes.downloaded)}{bytes.total>0?` / ${formatBytes(bytes.total)}`:''}</span>{bytes.speed>0&&<span>{formatBytes(bytes.speed)}/s</span>}</div>}{message&&<p role={stage==='error'?'alert':'status'}>{message}</p>}</div>}
    <section className="update-notes"><h3>▤ What&apos;s New in v{notice.latestVersion}</h3>{groups.length?groups.map(([heading,items])=><div key={heading}><strong>{heading}</strong><ul>{items.map((item,index)=><li key={`${heading}-${index}`}>{item}</li>)}</ul></div>):<p>{notice.notes||'See release details for this version.'}</p>}{notice.releaseDate&&<small>Released {notice.releaseDate}</small>}</section>
    <footer className="update-actions"><button type="button" className="update-later" onClick={dismiss}>Install Later</button><button type="button" className="update-install" disabled={installing} onClick={()=>void install()}>{installing?'Downloading…':stage==='error'?'Retry Download':notice.platform==='web'?'Open Download':'Download & Install'}</button></footer>
  </aside></div>;
}
