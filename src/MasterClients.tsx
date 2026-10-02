import { useState } from "react";
import type { FormEvent } from "react";
import { callBankSetuWorker } from "./workerApi";
import "./MasterClients.css";

type Props = { enabled: boolean };

export default function MasterClients({ enabled }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bankName, setBankName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await callBankSetuWorker("/create-client", {
        name: name.trim(), email: email.trim(), password, bankName: bankName.trim(),
      });
      window.dispatchEvent(new Event("banksetu-client-created"));
      setMessage("Client Admin created successfully. They can sign in and connect their Google Account.");
      setName("");
      setEmail("");
      setPassword("");
      setBankName("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to create the Client Admin. Please retry.");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  return (
    <section className="master-client-create">
      <div className="master-client-intro">
        <span className="master-client-icon" aria-hidden="true">+</span>
        <div>
          <h3>Give your client a workspace</h3>
          <p>Create their administrator account. They will connect their own Google Account when they sign in.</p>
        </div>
      </div>

      <form className="master-client-form" onSubmit={createClient} aria-label="Create Client Admin">
        <fieldset disabled={busy}>
          <div className="master-client-fields">
            <label>Client name
              <input required maxLength={100} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter client name" />
            </label>
            <label>Login email
              <input required type="email" maxLength={254} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="client@example.com" />
            </label>
            <label>Temporary password
              <input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
            </label>
            <label>Bank / CSP name
              <input required maxLength={120} autoComplete="off" value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Enter bank or CSP name" />
            </label>
          </div>
          <div className="master-client-actions">
            <p>Share the login details securely with your client.</p>
            <button type="submit">{busy ? "Creating account…" : "Create Client Admin"}</button>
          </div>
        </fieldset>
      </form>
      {error && <p className="master-client-notice master-client-error" role="alert">{error}</p>}
      {message && <p className="master-client-notice master-client-success" role="status">{message}</p>}
    </section>
  );
}
