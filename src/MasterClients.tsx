import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { callBankSetuWorker } from "./workerApi";

type ClientWorkspace = {
  id: string;
  bankName: string;
  status: string;
  maxUsers: number;
  clientUserCount: number;
};

type Props = { enabled: boolean };

export default function MasterClients({ enabled }: Props) {
  const [clients, setClients] = useState<ClientWorkspace[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bankName, setBankName] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [executorEmail, setExecutorEmail] = useState("");
  const [commonApiUrl, setCommonApiUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchClients = useCallback(async () => {
    const snapshot = await getDocs(collection(db, "tenants"));
    return snapshot.docs.map((item) => ({
      id: item.id,
      bankName: String(item.data().bankName || ""),
      status: String(item.data().status || "active"),
      maxUsers: Number(item.data().maxUsers || 2),
      clientUserCount: Number(item.data().clientUserCount || 0),
    }));
  }, []);

  const loadClients = useCallback(async () => {
    const items = await fetchClients();
    setClients(items);
  }, [fetchClients]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void callBankSetuWorker<{ oauthClientId?: string; executorEmail?: string; apiUrl?: string }>("/get-google-setup", {}).then((config) => {
      if (!active) return;
      setOauthClientId(String(config.oauthClientId || ""));
      setExecutorEmail(String(config.executorEmail || ""));
      setCommonApiUrl(String(config.apiUrl || ""));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to load Google setup configuration.");
    });
    void fetchClients().then((items) => {
      if (!active) return;
      setClients(items);
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Unable to load client workspaces.");
    });
    return () => { active = false; };
  }, [enabled, fetchClients]);

  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await callBankSetuWorker<{ tenantId?: string }>("/create-client", { name, email, password, bankName });
      const tenantId = String(result.tenantId || "");
      setMessage(`Client account created. Workspace ID: ${tenantId}`);
      setName("");
      setEmail("");
      setPassword("");
      setBankName("");
      await loadClients();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to create the client account.");
    } finally {
      setBusy(false);
    }
  };

  const saveGoogleConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await callBankSetuWorker("/save-google-setup", {
        oauthClientId,
        executorEmail,
        apiUrl: commonApiUrl,
      });
      setMessage("Bank Setu Google setup saved. Client Admins can now connect their own Google Drive.");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to save Google setup configuration.");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  const fieldStyle: CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "11px 12px", marginTop: 6,
    borderRadius: 9, border: "1px solid rgba(160,190,200,.28)", background: "rgba(4,22,30,.72)",
    color: "#eef7f7", fontSize: 14,
  };
  const labelStyle: CSSProperties = { display: "block", marginTop: 12, color: "#cbdadd", fontSize: 13 };
  const buttonStyle: CSSProperties = {
    marginTop: 14, padding: "11px 15px", border: 0, borderRadius: 9,
    color: "#06242a", background: "#63e2c4", fontWeight: 700, cursor: "pointer",
  };

  return (
    <section style={{ marginTop: 16, padding: 18, borderRadius: 16, background: "rgba(8,31,40,.92)", color: "#eef7f7" }}>
      <h2 style={{ margin: 0, fontSize: 19 }}>Client Workspaces</h2>
      <p style={{ color: "#b8c9cd", fontSize: 13, lineHeight: 1.5 }}>
        Set Bank Setu's shared Google connection once. After that, each Client Admin creates their own Sheet and Drive folder with one click during first login.
      </p>

      <div style={{ marginTop: 18, padding: 14, border: "1px solid rgba(99,226,196,.28)", borderRadius: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>One-time Bank Setu Google setup</h3>
        <p style={{ color: "#b8c9cd", fontSize: 13, lineHeight: 1.5 }}>
          Enter the Bank Setu OAuth Web Client ID, the shared Apps Script Web App URL, and the Google account that owns that Apps Script deployment. Client files will still be created in each Client Admin's own Drive.
        </p>
        <form onSubmit={saveGoogleConfig} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 4 }}>
          <label style={labelStyle}>Google OAuth Web Client ID<input required style={fieldStyle} value={oauthClientId} onChange={(event) => setOauthClientId(event.target.value)} placeholder="...apps.googleusercontent.com" /></label>
          <label style={labelStyle}>Apps Script deployment owner email<input required type="email" style={fieldStyle} value={executorEmail} onChange={(event) => setExecutorEmail(event.target.value)} placeholder="Google account used to deploy Apps Script" /></label>
          <label style={labelStyle}>Shared Apps Script Web App URL<input required type="url" style={fieldStyle} value={commonApiUrl} onChange={(event) => setCommonApiUrl(event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" /></label>
          <button disabled={busy} style={buttonStyle}>{busy ? "Saving…" : "Save One-time Setup"}</button>
        </form>
      </div>

      <form onSubmit={createClient} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 4 }}>
        <label style={labelStyle}>Client contact name<input required style={fieldStyle} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label style={labelStyle}>Client login email<input required type="email" style={fieldStyle} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label style={labelStyle}>Temporary password<input required type="password" minLength={8} style={fieldStyle} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label style={labelStyle}>Bank / CSP name<input required style={fieldStyle} value={bankName} onChange={(event) => setBankName(event.target.value)} /></label>
        <button disabled={busy} style={buttonStyle}>{busy ? "Working…" : "Create Client"}</button>
      </form>

      {error && <p role="alert" style={{ color: "#ffaaaa", marginTop: 12 }}>{error}</p>}
      {message && <p role="status" style={{ color: "#8de3c8", marginTop: 12 }}>{message}</p>}
      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr><th align="left">Workspace</th><th align="left">Bank</th><th align="left">Status</th><th align="left">Operational users</th></tr></thead>
          <tbody>{clients.map((client) => <tr key={client.id}>
            <td style={{ padding: "9px 4px", borderTop: "1px solid rgba(160,190,200,.16)" }}>{client.id}</td>
            <td style={{ padding: "9px 4px", borderTop: "1px solid rgba(160,190,200,.16)" }}>{client.bankName}</td>
            <td style={{ padding: "9px 4px", borderTop: "1px solid rgba(160,190,200,.16)" }}>{client.status}</td>
            <td style={{ padding: "9px 4px", borderTop: "1px solid rgba(160,190,200,.16)" }}>{client.clientUserCount}/{client.maxUsers}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
