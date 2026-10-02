import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { callBankSetuWorker } from "./workerApi";
import { loadGoogleIdentity, requestGoogleToken } from "./googleIdentity";
import BankFormatLayoutEditor from "./BankFormatLayoutEditor";
import type { BankFieldPlacement } from "./bankFormatUtils";

type FormatType = "passbook" | "quickPassbook" | "accountOpening";
type FormatItem = { fileId: string; fileName: string; mimeType: string; updatedAt?: string; fieldMap?: BankFieldPlacement[]; pageWidthMm?: number; pageHeightMm?: number };
type Workspace = {
  tenantId: string;
  bankName: string;
  googleEmail: string;
  photoFolderId: string;
  apiUrl: string;
  formats: Partial<Record<FormatType, FormatItem>>;
};

const formats: Array<{ id: FormatType; title: string; description: string }> = [
  { id: "passbook", title: "Passbook sample", description: "Upload the bank's regular passbook sample." },
  { id: "quickPassbook", title: "Quick Passbook sample", description: "Upload the bank's quick passbook sample." },
  { id: "accountOpening", title: "Account Opening PDF sample", description: "Upload the bank's account opening PDF sample." },
];

export default function BankFormats({ enabled, canManage }: { enabled: boolean; canManage: boolean }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<FormatType, { url: string; mimeType: string }>>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [connectionCheck, setConnectionCheck] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [editingFormat, setEditingFormat] = useState<FormatType | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      const tenantId = sessionStorage.getItem("bankSetuTenantId")?.trim() || "";
      if (!tenantId) throw new Error("This account is not assigned to a client workspace.");
      const [settings, googleConfig] = await Promise.all([
        getDoc(doc(db, "tenantSettings", tenantId)),
        canManage ? callBankSetuWorker<{ oauthClientId?: string }>("/get-google-setup", {}) : Promise.resolve(null),
        loadGoogleIdentity(),
      ]);
      if (!settings.exists()) throw new Error("Client workspace settings could not be found.");
      const data = settings.data();
      const config = googleConfig || undefined;
      if (!active) return;
      setWorkspace({
        tenantId,
        bankName: String(data.bankName || ""),
        googleEmail: String(data.googleEmail || ""),
        photoFolderId: String(data.photoFolderId || ""),
        apiUrl: String(data.apiUrl || ""),
        formats: (data.bankFormats || {}) as Partial<Record<FormatType, FormatItem>>,
      });
      setOauthClientId(String(config?.oauthClientId || ""));
    };
    void load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to load bank format samples.");
    });
    return () => { active = false; };
  }, [enabled, canManage]);

  if (!enabled) return null;

  const loadPreview = async (formatType: FormatType) => {
    if (!workspace) return;
    setBusy(`preview:${formatType}`);
    setError("");
    setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");
      const response = await fetch(workspace.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "getBankFormatPreview", idToken: await user.getIdToken(), formatType }),
      });
      const result = await response.json() as { success?: boolean; data?: string; mimeType?: string; message?: string };
      if (!response.ok || !result.success || !result.data || !result.mimeType) {
        throw new Error(result.message || "The sample preview could not be loaded. Deploy the latest Apps Script version and retry.");
      }
      setPreviews((current) => ({
        ...current,
        [formatType]: { url: `data:${result.mimeType};base64,${result.data}`, mimeType: result.mimeType },
      }));
      return `data:${result.mimeType};base64,${result.data}`;
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to preview this sample.");
    } finally {
      setBusy("");
    }
  };

  const preview = async (formatType: FormatType) => { await loadPreview(formatType); };

  const editLayout = async (formatType: FormatType) => {
    if (!previews[formatType]) {
      const url = await loadPreview(formatType);
      if (url) setEditingFormat(formatType);
    } else {
      setEditingFormat(formatType);
    }
  };

  const saveMapping = async (formatType: FormatType, fieldMap: BankFieldPlacement[], pageWidthMm: number, pageHeightMm: number) => {
    const response = await callBankSetuWorker<{ success?: boolean }>("/save-bank-format-mapping", { formatType, fieldMap, pageWidthMm, pageHeightMm });
    if (!response.success) throw new Error("The bank format field layout could not be saved.");
    setWorkspace((current) => current ? {
      ...current,
      formats: { ...current.formats, [formatType]: { ...current.formats[formatType], fieldMap, pageWidthMm, pageHeightMm } },
    } : current);
    setEditingFormat(null);
    setMessage("Field positions saved. The mapped format will be used when printing this document.");
  };

  const upload = async (formatType: FormatType, file?: File) => {
    if (!file || !workspace) return;
    setBusy(`upload:${formatType}`);
    setError("");
    setMessage("");
    let accessToken = "";
    let uploadedFileId = "";
    try {
      if (!workspace.photoFolderId || !workspace.googleEmail || !oauthClientId) {
        throw new Error("Connect your Google Drive and complete Bank Setu's one-time Google setup first.");
      }
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a sample up to 5 MB.");
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Upload a PDF, JPG, PNG, or WebP sample.");
      }
      accessToken = await requestGoogleToken(oauthClientId, "select_account");
      const accountResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const account = await accountResponse.json() as { email?: string };
      if (!accountResponse.ok || String(account.email || "").toLowerCase() !== workspace.googleEmail.toLowerCase()) {
        throw new Error(`Reconnect the Google account ${workspace.googleEmail} that owns this workspace.`);
      }
      const boundary = `banksetu_${crypto.randomUUID().replaceAll("-", "")}`;
      const metadata = {
        name: `Bank Setu ${formatType} sample - ${file.name}`,
        mimeType: file.type,
        parents: [workspace.photoFolderId],
        appProperties: { bankSetuFormat: formatType, tenantId: workspace.tenantId },
      };
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`, file, `\r\n--${boundary}--`,
      ], { type: `multipart/related; boundary=${boundary}` });
      const uploadResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      });
      const uploaded = await uploadResponse.json() as { id?: string; name?: string; mimeType?: string; error?: { message?: string } };
      if (!uploadResponse.ok || !uploaded.id) throw new Error(uploaded.error?.message || "Google Drive could not save this sample.");
      uploadedFileId = uploaded.id;
      await callBankSetuWorker("/save-bank-format-template", {
        formatType,
        fileId: uploaded.id,
        fileName: uploaded.name || file.name,
        mimeType: uploaded.mimeType || file.type,
        accessToken,
      });
      const url = URL.createObjectURL(file);
      setPreviews((current) => ({ ...current, [formatType]: { url, mimeType: file.type } }));
      setWorkspace((current) => current ? {
        ...current,
        formats: { ...current.formats, [formatType]: { fileId: uploaded.id!, fileName: uploaded.name || file.name, mimeType: uploaded.mimeType || file.type } },
      } : current);
      setMessage(`${formats.find((item) => item.id === formatType)?.title} uploaded to your Google Drive.`);
    } catch (reason: unknown) {
      if (accessToken && uploadedFileId) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploadedFileId)}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => undefined);
      }
      setError(reason instanceof Error ? reason.message : "Unable to upload this bank format sample.");
    } finally {
      setBusy("");
    }
  };

  const testConnection = async () => {
    if (!workspace) return;
    setBusy("connection-test");
    setError("");
    setConnectionCheck("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");
      const response = await fetch(workspace.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "testTenantConnection", idToken: await user.getIdToken() }),
      });
      const result = await response.json() as {
        success?: boolean; message?: string; spreadsheetName?: string; photoFolderName?: string; customerTab?: string;
      };
      if (!response.ok || !result.success) throw new Error(result.message || "Workspace connection test failed.");
      setConnectionCheck(`Connected: ${result.spreadsheetName} · ${result.photoFolderName} · ${result.customerTab}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Workspace connection test failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section style={panel}>
      <p style={eyebrow}>BANK FORMATS</p>
      <h1 style={{ margin: "6px 0", fontSize: 22 }}>{workspace?.bankName || "Client bank"} formats</h1>
      <p style={copy}>Upload and preview samples stored in this workspace's Google Drive. Supported sample types: PDF, JPG, PNG, WebP, up to 5 MB.</p>
      {workspace?.googleEmail && <p style={{ ...copy, marginTop: 4 }}>Connected Drive: {workspace.googleEmail}</p>}
      <button style={secondaryButton} disabled={Boolean(busy) || !workspace?.apiUrl} onClick={() => void testConnection()}>
        {busy === "connection-test" ? "Testing…" : "Test workspace connection"}
      </button>
      {connectionCheck && <p role="status" style={{ color: "#176b54", fontSize: 13 }}>{connectionCheck}</p>}
      <div style={grid}>
        {formats.map((item) => {
          const sample = workspace?.formats[item.id];
          const filePreview = previews[item.id];
          return (
            <article key={item.id} style={card}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{item.title}</h2>
              <p style={copy}>{item.description}</p>
              {sample ? <p style={{ ...copy, color: "#245d52", wordBreak: "break-word" }}>{sample.fileName}</p> : <p style={copy}>No sample uploaded yet.</p>}
              {canManage && (
                <label style={uploadLabel}>
                  {busy === `upload:${item.id}` ? "Uploading…" : sample ? "Replace sample" : "Upload sample"}
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    void upload(item.id, file);
                  }} style={{ display: "none" }} />
                </label>
              )}
              {sample && <button style={secondaryButton} disabled={Boolean(busy)} onClick={() => void preview(item.id)}>{busy === `preview:${item.id}` ? "Loading preview…" : "Preview sample"}</button>}
              {sample && canManage && <button style={secondaryButton} disabled={Boolean(busy)} onClick={() => void editLayout(item.id)}>{workspace?.formats[item.id]?.fieldMap?.length ? "Edit field layout" : "Map fields for printing"}</button>}
              {filePreview && (filePreview.mimeType === "application/pdf"
                ? <iframe title={`${item.title} preview`} src={filePreview.url} style={previewFrame} />
                : <img alt={`${item.title} preview`} src={filePreview.url} style={previewImage} />)}
            </article>
          );
        })}
      </div>
      {error && <p role="alert" style={{ color: "#a22" }}>{error}</p>}
      {message && <p role="status" style={{ color: "#176b54" }}>{message}</p>}
      {!workspace?.googleEmail && canManage && <p style={errorHint}>Connect your Google Drive first to store templates in your own account.</p>}
      {editingFormat && previews[editingFormat] && workspace && <BankFormatLayoutEditor
        sampleUrl={previews[editingFormat].url}
        mimeType={previews[editingFormat].mimeType}
        initialMap={workspace.formats[editingFormat]?.fieldMap || []}
        initialWidth={workspace.formats[editingFormat]?.pageWidthMm || (editingFormat === "accountOpening" ? 210 : 205)}
        initialHeight={workspace.formats[editingFormat]?.pageHeightMm || (editingFormat === "accountOpening" ? 297 : 175)}
        onSave={(fieldMap, pageWidthMm, pageHeightMm) => saveMapping(editingFormat, fieldMap, pageWidthMm, pageHeightMm)}
        onClose={() => setEditingFormat(null)}
      />}
    </section>
  );
}

const panel = { padding: 20, borderRadius: 16, background: "#f6f8fb", color: "#17202a", border: "1px solid #e1e7ef" };
const eyebrow = { margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 1, color: "#117864" };
const copy = { color: "#596579", fontSize: 13, lineHeight: 1.5 };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14, marginTop: 18 };
const card = { padding: 16, borderRadius: 13, background: "#fff", border: "1px solid #e1e7ef", boxShadow: "0 8px 24px rgba(30,45,70,.06)" };
const uploadLabel = { display: "inline-flex", alignItems: "center", minHeight: 40, padding: "0 13px", marginRight: 8, borderRadius: 9, background: "#176b54", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700 };
const secondaryButton = { minHeight: 40, padding: "0 13px", borderRadius: 9, border: "1px solid #c9d2df", background: "#fff", color: "#17202a", cursor: "pointer", fontSize: 13, fontWeight: 700 };
const previewFrame = { display: "block", width: "100%", height: 480, marginTop: 14, border: "1px solid #e1e7ef", borderRadius: 8 };
const previewImage = { display: "block", maxWidth: "100%", maxHeight: 560, margin: "14px auto 0", border: "1px solid #e1e7ef", borderRadius: 8, objectFit: "contain" as const };
const errorHint = { marginTop: 16, color: "#8a5b00", fontSize: 13 };
