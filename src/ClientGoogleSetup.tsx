import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { callBankSetuWorker } from "./workerApi";
import { setTenantApiUrl, setTenantWorkspaceReady } from "./tenantApi";
import { loadGoogleIdentity, requestGoogleToken } from "./googleIdentity";
import type { FormEvent } from "react";

type SetupConfig = {
  oauthClientId: string;
  apiUrl: string;
  executorEmail: string;
  tenantId: string;
  bankName: string;
  spreadsheetId: string;
  photoFolderId: string;
  googleEmail: string;
  dataApiReady: boolean;
  hasWorkspace: boolean;
  workspaceStatus: string;
  bankInfo: BankRegistration;
};

type BankRegistration = {
  bankName: string;
  passbookBank: string;
  branchName: string;
  cspCode: string;
  operatorName: string;
  address: string;
};

const EMPTY_REGISTRATION: BankRegistration = {
  bankName: "", passbookBank: "", branchName: "", cspCode: "", operatorName: "", address: "",
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

export default function ClientGoogleSetup({ enabled, placement = "onboarding" }: { enabled: boolean; placement?: "onboarding" | "manage" }) {
  const [config, setConfig] = useState<SetupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [googleReady, setGoogleReady] = useState(Boolean(window.google?.accounts?.oauth2));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [registration, setRegistration] = useState<BankRegistration>(EMPTY_REGISTRATION);
  const [registrationSaved, setRegistrationSaved] = useState(false);
  const [savingRegistration, setSavingRegistration] = useState(false);
  const [workspaceStatus, setWorkspaceStatus] = useState("active");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // Preload GIS before the click so the OAuth popup remains tied to the
    // browser's user gesture instead of being blocked after an async script load.
    void loadGoogleIdentity().then(() => {
      if (active) setGoogleReady(true);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Google sign-in could not be loaded.");
    });
    callBankSetuWorker<SetupConfig>("/get-google-setup", {}).then((loaded) => {
      if (!active) return;
      setConfig(loaded);
      setWorkspaceStatus(loaded.workspaceStatus || "active");
      const details = { ...EMPTY_REGISTRATION, ...(loaded.bankInfo || {}), bankName: loaded.bankName || "" };
      setRegistration(details);
      setRegistrationSaved(Boolean(details.bankName && details.passbookBank && details.branchName && details.operatorName));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to load Google setup.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [enabled]);

  if (!enabled || loading) return null;
  if (placement === "onboarding" && config?.hasWorkspace) return null;

  const saveRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingRegistration(true);
    setError("");
    try {
      await callBankSetuWorker("/save-client-registration", {
        bankName: registration.bankName,
        passbookBank: registration.passbookBank,
        branchName: registration.branchName,
        cspCode: registration.cspCode,
        operatorName: registration.operatorName,
        address: registration.address,
      });
      setRegistrationSaved(true);
      setConfig((current) => current ? { ...current, bankName: registration.bankName, bankInfo: registration } : current);
      setSuccess("Bank details saved. Next, connect your Google account to create your private workspace.");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Bank details could not be saved.");
    } finally {
      setSavingRegistration(false);
    }
  };

  const connect = async () => {
    setConnecting(true);
    setError("");
    setSuccess("");
    let accessToken = "";
    let folderId = "";
    let spreadsheetId = "";
    let createdResources = false;
    try {
      if (!config?.oauthClientId || !config.executorEmail || !config.apiUrl || !config.tenantId) {
        throw new Error("Bank Setu setup is incomplete. Please contact the Master Admin.");
      }
      if (!registrationSaved) throw new Error("Save your bank details before connecting Google Drive.");
      if (!googleReady || !window.google?.accounts?.oauth2) throw new Error("Google sign-in is still loading. Please try again.");
      accessToken = await requestGoogleToken(config.oauthClientId);
      const profile = await googleApi<{ email?: string }>("https://www.googleapis.com/oauth2/v2/userinfo", accessToken);
      if (!profile.email) throw new Error("Google did not return the connected account email.");

      if (config.hasWorkspace && config.spreadsheetId && config.photoFolderId) {
        // Reconnect the existing isolated workspace; never create duplicates.
        folderId = config.photoFolderId;
        spreadsheetId = config.spreadsheetId;
      } else {
        const folder = await googleApi<{ id?: string }>("https://www.googleapis.com/drive/v3/files?fields=id", accessToken, {
          method: "POST",
          body: JSON.stringify({ name: `Bank Setu - ${config.bankName || "Client Workspace"}`, mimeType: "application/vnd.google-apps.folder" }),
        });
        folderId = String(folder.id || "");
        if (!folderId) throw new Error("Google Drive did not create the workspace folder.");
        createdResources = true;

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
      }

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Bank Setu login expired. Sign in again and retry setup.");
      await callBankSetuWorker("/configure-tenant-data", { tenantId: config.tenantId, spreadsheetId, photoFolderId: folderId, googleEmail: profile.email, accessToken });
      const readiness = await callBankSetuWorker<SetupConfig>("/get-google-setup", {});
      const ready = readiness.dataApiReady === true && Boolean(readiness.spreadsheetId && readiness.photoFolderId);
      setConfig({ ...readiness, hasWorkspace: true, spreadsheetId, photoFolderId: folderId, googleEmail: profile.email });
      setTenantWorkspaceReady(ready);
      if (ready) {
        setTenantApiUrl(config.apiUrl);
        setSuccess("Your Google Drive workspace is ready. The Bank Setu app received access only to this workspace folder.");
      } else {
        setSuccess("Google Drive and your private Sheet are connected. Customer data stays locked until the isolated Apps Script version is deployed.");
      }
    } catch (reason: unknown) {
      // Best effort cleanup avoids leaving half-created workspaces if setup fails.
      if (accessToken && createdResources) {
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
      <p style={{ margin: 0, color: "#63e2c4", fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>{placement === "manage" ? "CLIENT WORKSPACE SETTINGS" : "FIRST-TIME CLIENT REGISTRATION"}</p>
      <h2 style={{ margin: "8px 0", fontSize: 20 }}>{placement === "manage" ? "Bank and Google workspace" : "Set up your bank workspace"}</h2>
      <p style={copyStyle}>Enter your bank and branch details. Then connect your own Google account. Bank Setu creates a new Sheet in your Drive with the standard Bank Setu columns; your data stays in your workspace.</p>
      {(placement === "manage" || !registrationSaved) && <form onSubmit={(event) => void saveRegistration(event)} style={registrationForm}>
        <label style={registrationLabel}>Bank / CSP name<input required maxLength={120} style={registrationInput} value={registration.bankName} onChange={(event) => setRegistration((current) => ({ ...current, bankName: event.target.value }))} /></label>
        <label style={registrationLabel}>Bank for Passbook format<input required maxLength={120} style={registrationInput} value={registration.passbookBank} onChange={(event) => setRegistration((current) => ({ ...current, passbookBank: event.target.value }))} /></label>
        <label style={registrationLabel}>Branch name<input required maxLength={120} style={registrationInput} value={registration.branchName} onChange={(event) => setRegistration((current) => ({ ...current, branchName: event.target.value }))} /></label>
        <label style={registrationLabel}>CSP code (optional)<input maxLength={80} style={registrationInput} value={registration.cspCode} onChange={(event) => setRegistration((current) => ({ ...current, cspCode: event.target.value }))} /></label>
        <label style={registrationLabel}>Operator name<input required maxLength={120} style={registrationInput} value={registration.operatorName} onChange={(event) => setRegistration((current) => ({ ...current, operatorName: event.target.value }))} /></label>
        <label style={{ ...registrationLabel, gridColumn: "1 / -1" }}>Branch / CSP address<textarea maxLength={500} style={{ ...registrationInput, minHeight: 70 }} value={registration.address} onChange={(event) => setRegistration((current) => ({ ...current, address: event.target.value }))} /></label>
        <button type="submit" style={buttonStyle} disabled={savingRegistration || workspaceStatus !== "active"}>{savingRegistration ? "Saving bank details…" : "Save bank details"}</button>
      </form>}
      {registrationSaved && placement === "onboarding" && <p style={{ ...copyStyle, color: "#8de3c8" }}>Bank details saved for {registration.bankName}. Next step: connect your Google account.</p>}
      {config?.hasWorkspace && <p style={{ ...copyStyle, color: "#8de3c8" }}>Connected Google account: {config.googleEmail || "Workspace connected"}. Reconnect uses this same Drive folder and Sheet.</p>}
      {(!config?.hasWorkspace || placement === "manage") && <button type="button" style={buttonStyle} onClick={() => void connect()} disabled={connecting || !googleReady || !config?.oauthClientId || !registrationSaved || workspaceStatus !== "active"}>
        {connecting ? "Connecting Google workspace…" : !googleReady ? "Loading Google sign-in…" : config?.hasWorkspace ? "Reconnect existing Google workspace" : "Connect Google and create my workspace"}
      </button>}
      {workspaceStatus !== "active" && <p role="alert" style={errorStyle}>This workspace is {workspaceStatus}. Ask the Master Admin to restore it before connecting Google or entering customer data.</p>}
      {config?.hasWorkspace && !config.dataApiReady && <p role="status" style={copyStyle}>Your private Google workspace is connected. Customer data stays locked until its tenant-isolated data API is deployed.</p>}
      {config?.hasWorkspace && config.dataApiReady && <p style={copyStyle}>Your Google workspace is connected. Save the bank details above to complete registration.</p>}
      {!config?.oauthClientId && <p style={errorStyle}>Google sign-in configuration is missing. Contact the Master Admin.</p>}
      {error && <p role="alert" style={errorStyle}>{error}</p>}
      {success && <p role="status" style={{ ...copyStyle, color: "#8de3c8" }}>{success}{config?.dataApiReady && <><br /><button type="button" style={{ ...buttonStyle, marginTop: 10 }} onClick={() => window.location.reload()}>Open my workspace</button></>}</p>}
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
const registrationForm = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, margin: "18px 0" };
const registrationLabel = { display: "grid", gap: 6, color: "#d8e8ea", fontSize: 12, fontWeight: 700 };
const registrationInput = { width: "100%", minHeight: 40, padding: "9px 10px", border: "1px solid rgba(160,190,200,.32)", borderRadius: 8, background: "#0b2630", color: "#f2fbfc", font: "inherit" };
