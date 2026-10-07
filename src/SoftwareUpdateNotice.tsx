import { useEffect, useState } from "react";
import { startUpdatePolling } from "./platform/updatePolling";
import { downloadAndroidUpdate, isAndroid } from "./platform/android/runtime";
import { checkAndroidUpdate } from "./platform/android/updates";

declare const __APP_VERSION__: string;

type DesktopBridge = {
  version(): Promise<string>;
  checkUpdate(): Promise<unknown>;
  installUpdate(): Promise<void>;
  onUpdateProgress(callback: (progress: { percent?: number }) => void): () => void;
};

type UpdateNoticeState = {
  available: boolean;
  latestVersion: string;
  downloadUrl: string;
  notes: string;
  platform: "web" | "android" | "windows";
};

type VersionManifest = {
  latestVersion?: string;
  downloadUrl?: string;
  notes?: string;
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
      platform: "android",
    };
  }

  const desktop = desktopBridge();
  if (desktop) {
    const [installedVersion, rawResult] = await Promise.all([
      desktop.version(),
      desktop.checkUpdate(),
    ]);
    const result = rawResult as { latestVersion?: string; notes?: string };
    const latestVersion = String(result.latestVersion || installedVersion);
    return {
      available: compareVersions(latestVersion, installedVersion) > 0,
      latestVersion,
      downloadUrl: "",
      notes: String(result.notes || ""),
      platform: "windows",
    };
  }

  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Update manifest unavailable.");
  const manifest = (await response.json()) as VersionManifest;
  const latestVersion = String(manifest.latestVersion || current).trim();
  return {
    available: compareVersions(latestVersion, current) > 0,
    latestVersion,
    downloadUrl: String(manifest.downloadUrl || "").trim(),
    notes: String(manifest.notes || "").trim(),
    platform: "web",
  };
}

export default function SoftwareUpdateNotice() {
  const [notice, setNotice] = useState<UpdateNoticeState | null>(null);
  const [message, setMessage] = useState("");
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const bridge = desktopBridge();
    return bridge?.onUpdateProgress?.(event => {
      const percent = Math.min(100, Math.max(0, Number(event.percent || 0)));
      setProgress(percent);
      setMessage(`Downloading Windows update… ${Math.round(percent)}%`);
    });
  }, []);

  useEffect(() => {
    let active = true;
    const stop = startUpdatePolling(async () => {
      const result = await findUpdate();
      if (!active) return;
      if (!result.available) { setNotice(null); return; }
      let dismissed = "";
      try { dismissed = sessionStorage.getItem("bankSetuUpdateDismissed") || ""; } catch { /* Storage is optional. */ }
      if (dismissed !== result.latestVersion) setNotice(result);
    });
    return () => { active = false; stop(); };
  }, []);

  if (!notice) return null;

  const dismiss = () => {
    try { sessionStorage.setItem("bankSetuUpdateDismissed", notice.latestVersion); } catch { /* Storage is optional. */ }
    setNotice(null);
  };

  const install = async () => {
    if (installing) return;
    setInstalling(true);
    setProgress(0);
    let handedToInstaller = false;
    try {
      if (notice.platform === "android") {
        setMessage("Downloading Android update…");
        await downloadAndroidUpdate(notice.downloadUrl, percent => { setProgress(percent); setMessage(`Downloading Android update… ${Math.round(percent)}%`); });
        setProgress(100);
        setMessage("Download complete. Android installer opened; approve the system installation prompt.");
        handedToInstaller = true;
        return;
      }
      if (notice.platform === "windows" && desktopBridge()) {
        setMessage("Downloading and verifying the Windows update…");
        await desktopBridge()!.installUpdate();
        setProgress(100);
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
      setMessage(
        error instanceof Error
          ? error.message
          : "The update could not be installed. Your local data is retained."
      );
    } finally { if (!handedToInstaller) setInstalling(false); }
  };

  return (
    <aside
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 3000,
        width: "min(380px, calc(100vw - 32px))",
        padding: "16px 18px",
        borderRadius: 16,
        color: "#fff",
        background:
          "linear-gradient(135deg, rgba(11,56,83,.98), rgba(15,126,123,.98))",
        boxShadow: "0 18px 44px rgba(4,25,42,.28)",
        border: "1px solid rgba(255,255,255,.2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <strong style={{ display: "block", fontSize: 15 }}>
            New Bank Setu update available
          </strong>
          <span style={{ display: "block", marginTop: 4, fontSize: 13, opacity: 0.9 }}>
            Version {notice.latestVersion} is ready to download.
          </span>
        </div>
        <button
          type="button"
          aria-label="Dismiss update notification"
          onClick={dismiss}
          style={{
            border: 0,
            background: "transparent",
            color: "#fff",
            fontSize: 22,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      {notice.notes && (
        <p style={{ margin: "10px 0 0", fontSize: 12, opacity: 0.88 }}>
          {notice.notes}
        </p>
      )}
      {message && (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#ffe3a8" }}>
          {message}
        </p>
      )}
      {progress !== null && installing && <div role="progressbar" aria-label="Update download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} style={{marginTop:12,height:12,borderRadius:8,background:"#ffffff44",overflow:"hidden"}}><div style={{width:`${progress}%`,height:"100%",background:"#d7ff75",transition:"width .2s"}} /></div>}
      {progress !== null && installing && <strong style={{display:"block",marginTop:4,fontSize:12}}>{Math.round(progress)}%</strong>}
      <button
        type="button"
        disabled={installing}
        onClick={() => void install()}
        style={{
          marginTop: 14,
          padding: "9px 14px",
          border: 0,
          borderRadius: 9,
          background: "#d7ff75",
          color: "#153c34",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {installing ? "Downloading…" : "Download / Install update"}
      </button>
    </aside>
  );
}
