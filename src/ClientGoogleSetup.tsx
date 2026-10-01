import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth } from "./firebase";
import { setTenantApiUrl } from "./tenantApi";
import { loadGoogleIdentity, requestGoogleToken } from "./googleIdentity";

type SetupConfig = {
  oauthClientId: string;
  apiUrl: string;
  executorEmail: string;
  tenantId: string;
  bankName: string;
  spreadsheetId: string;
  photoFolderId: string;
  googleEmail: string;
};

async function googleApi<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `Google API request failed (${response.status}).`);
  return payload;
}

export default function ClientGoogleSetup({ enabled }: { enabled: boolean }) {
  const [config, setConfig] = useState<SetupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([
      httpsCallable(getFunctions(), "getGoogleSetupConfig")({}),
      loadGoogleIdentity(),
    ]).then(([result]) => {
      if (!active) return;
      setConfig(result.data as SetupConfig);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to load Google setup.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [enabled]);

  if (!enabled || loading) return null;
  if (config?.spreadsheetId && config.photoFolderId && !success) return null;

  const connect = async () => {
    setConnecting(true);
    setError("");
    setSuccess("");
    let accessToken = "";
    let folderId = "";
    let spreadsheetId = "";
    try {
      if (!config?.oauthClientId || !config.executorEmail || !config.apiUrl || !config.tenantId) {
        throw new Error("Bank Setu setup is incomplete. Please contact the Master Admin.");
      }
      accessToken = await requestGoogleToken(config.oauthClientId);
      const profile = await googleApi<{ email?: string }>("https://www.googleapis.com/oauth2/v2/userinfo", accessToken);
      if (!profile.email) throw new Error("Google did not return the connected account email.");

      const folder = await googleApi<{ id?: string }>("https://www.googleapis.com/drive/v3/files?fields=id", accessToken, {
        method: "POST",
        body: JSON.stringify({ name: `Bank Setu - ${config.bankName || "Client Workspace"}`, mimeType: "application/vnd.google-apps.folder" }),
      });
      folderId = String(folder.id || "");
      if (!folderId) throw new Error("Google Drive did not create the workspace folder.");

      const sheet = await googleApi<{ spreadsheetId?: string }>("https://sheets.googleapis.com/v4/spreadsheets?fields=spreadsheetId", accessToken, {
        method: "POST",
        body: JSON.stringify({
          properties: { title: `Bank Setu - ${config.bankName || "Client Workspace"}` },
          sheets: [{ properties: { title: "Sheet1", gridProperties: { frozenRowCount: 1 } } }],
        }),
      });
      spreadsheetId = String(sheet.spreadsheetId || "");
      if (!spreadsheetId) throw new Error("Google Sheets did not create the workspace spreadsheet.");

      const fileInfo = await googleApi<{ parents?: string[] }>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?fields=parents`, accessToken);
      const query = new URLSearchParams({ addParents: folderId, fields: "id,parents" });
      if (fileInfo.parents?.length) query.set("removeParents", fileInfo.parents.join(","));
      await googleApi(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?${query}`, accessToken, { method: "PATCH" });

      // Give the Apps Script deployment account access only to this workspace folder.
      await googleApi(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions?sendNotificationEmail=false`, accessToken, {
        method: "POST",
        body: JSON.stringify({ type: "user", role: "writer", emailAddress: config.executorEmail }),
      });

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Bank Setu login expired. Sign in again and retry setup.");
      const save = httpsCallable(getFunctions(), "configureTenantData");
      await save({ tenantId: config.tenantId, spreadsheetId, photoFolderId: folderId, googleEmail: profile.email, accessToken });
      setTenantApiUrl(config.apiUrl);
      setConfig({ ...config, spreadsheetId, photoFolderId: folderId, googleEmail: profile.email });
      setSuccess("Your Google Drive workspace is ready. The Bank Setu app received access only to this workspace folder.");
    } catch (reason: unknown) {
      // Best effort cleanup avoids leaving half-created workspaces if setup fails.
      if (accessToken) {
        for (const fileId of [spreadsheetId, folderId].filter(Boolean)) {
          await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          }).catch(() => undefined);
        }
      }
      setError(reason instanceof Error ? reason.message : "Google Drive setup failed. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <section style={cardStyle}>
      <p style={{ margin: 0, color: "#63e2c4", fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>FIRST-TIME SETUP</p>
      <h2 style={{ margin: "8px 0", fontSize: 20 }}>Connect your Google Drive</h2>
      <p style={copyStyle}>Bank Setu will create your Sheet and workspace folder in the Google account you choose. The app gets access only to that workspace folder so it can save and find your customer records.</p>
      <button type="button" style={buttonStyle} onClick={() => void connect()} disabled={connecting || !config?.oauthClientId}>
        {connecting ? "Connecting Google Drive…" : "Connect my Google account"}
      </button>
      {!config?.oauthClientId && <p style={errorStyle}>Master Admin must finish Bank Setu's one-time Google setup first.</p>}
      {error && <p role="alert" style={errorStyle}>{error}</p>}
      {success && <p role="status" style={{ ...copyStyle, color: "#8de3c8" }}>{success}<br /><button type="button" style={{ ...buttonStyle, marginTop: 10 }} onClick={() => window.location.reload()}>Open my workspace</button></p>}
    </section>
  );
}

const cardStyle = {
  margin: "14px 0", padding: 18, borderRadius: 14,
  border: "1px solid rgba(99,226,196,.35)", background: "rgba(8,31,40,.96)", color: "#eef7f7",
};
const copyStyle = { color: "#b8c9cd", fontSize: 13, lineHeight: 1.55 };
const buttonStyle = {
  padding: "10px 15px", border: 0, borderRadius: 9, color: "#06242a",
  background: "#63e2c4", fontWeight: 700, cursor: "pointer",
};
const errorStyle = { color: "#ffaaaa", fontSize: 13, lineHeight: 1.5 };
