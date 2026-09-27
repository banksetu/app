import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";

import { auth } from "./firebase";

const STORAGE_KEY = "bankSetuApiUrl";

function Settings() {
  const [apiUrl, setApiUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");

  const [status, setStatus] = useState<
    "not-connected" | "testing" | "connected" | "error"
  >("not-connected");

  const [message, setMessage] = useState("");

  const [unlocked, setUnlocked] = useState(false);

  const [password, setPassword] = useState("");
  const [showAuthBox, setShowAuthBox] = useState(false);

  const [authLoading, setAuthLoading] = useState(false);

  const [removeMode, setRemoveMode] = useState(false);
  const [removeText, setRemoveText] = useState("");

  useEffect(() => {
    const existingUrl =
      localStorage.getItem(STORAGE_KEY) || "";

    setSavedUrl(existingUrl);
    setApiUrl(existingUrl);
  }, []);

  const validateUrl = (url: string) => {
    return (
      url.startsWith("https://script.google.com/") &&
      url.includes("/exec")
    );
  };

  const unlockAdminControl = async () => {
    const user = auth.currentUser;

    if (!user || !user.email) {
      setMessage(
        "Admin authentication session was not found."
      );
      return;
    }

    if (!password) {
      setMessage(
        "Enter your current admin login password."
      );
      return;
    }

    setAuthLoading(true);
    setMessage("");

    try {
      const credential =
        EmailAuthProvider.credential(
          user.email,
          password
        );

      await reauthenticateWithCredential(
        user,
        credential
      );

      setUnlocked(true);
      setShowAuthBox(false);
      setPassword("");

      setMessage(
        "Administrator control unlocked successfully."
      );

      /*
        Security के लिए 5 मिनट बाद
        panel फिर automatically lock हो जाएगा.
      */
      window.setTimeout(() => {
        setUnlocked(false);
        setRemoveMode(false);
        setRemoveText("");
      }, 5 * 60 * 1000);
    } catch (error) {
      console.error(error);

      setMessage(
        "Admin verification failed. Please check your password."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const lockControl = () => {
    setUnlocked(false);
    setPassword("");
    setRemoveMode(false);
    setRemoveText("");

    setApiUrl(savedUrl);

    setMessage(
      "Administrator control locked."
    );
  };

  const saveConnection = () => {
    if (!unlocked) {
      setMessage(
        "Administrator verification is required before changing the API connection."
      );
      setShowAuthBox(true);
      return;
    }

    const cleanUrl = apiUrl.trim();

    if (!cleanUrl) {
      setMessage(
        "Apps Script Web App URL is required."
      );
      return;
    }

    if (!validateUrl(cleanUrl)) {
      setMessage(
        "Enter a valid Google Apps Script Web App URL ending with /exec."
      );
      return;
    }

    const confirmed = window.confirm(
      "Do you want to update the Bank Setu database connection?"
    );

    if (!confirmed) return;

    localStorage.setItem(
      STORAGE_KEY,
      cleanUrl
    );

    setSavedUrl(cleanUrl);
    setApiUrl(cleanUrl);

    setStatus("not-connected");

    setMessage(
      "Database connection updated successfully."
    );
  };

  const testConnection = async () => {
    const url =
      savedUrl.trim() ||
      apiUrl.trim();

    if (!url) {
      setMessage(
        "No Apps Script connection is saved."
      );
      return;
    }

    if (!validateUrl(url)) {
      setMessage(
        "Saved Apps Script URL is invalid."
      );
      return;
    }

    setStatus("testing");
    setMessage(
      "Testing Google Sheet connection..."
    );

    try {
      const response = await fetch(
        `${url}?action=status`
      );

      const result =
        await response.json();

      if (result?.success) {
        setStatus("connected");

        setMessage(
          result.message ||
            "Bank Setu API connection successful."
        );
      } else {
        setStatus("error");

        setMessage(
          result?.message ||
            "Connection failed."
        );
      }
    } catch (error) {
      console.error(error);

      setStatus("error");

      setMessage(
        "Could not connect to the Bank Setu API."
      );
    }
  };

  const requestRemove = () => {
    if (!unlocked) {
      setMessage(
        "Administrator verification is required before removing the connection."
      );

      setShowAuthBox(true);
      return;
    }

    setRemoveMode(true);
    setRemoveText("");
    setMessage("");
  };

  const removeConnection = () => {
    if (!unlocked) return;

    if (
      removeText.trim().toUpperCase() !==
      "REMOVE API"
    ) {
      setMessage(
        'Type "REMOVE API" exactly to confirm removal.'
      );
      return;
    }

    const confirmed = window.confirm(
      "Final confirmation: removing this connection will stop Google Sheet save and search features. Continue?"
    );

    if (!confirmed) return;

    localStorage.removeItem(
      STORAGE_KEY
    );

    setSavedUrl("");
    setApiUrl("");

    setStatus("not-connected");

    setRemoveMode(false);
    setRemoveText("");

    setUnlocked(false);

    setMessage(
      "Google Sheet API connection removed."
    );
  };

  const maskedUrl = savedUrl
    ? `${savedUrl.slice(0, 34)}••••••••••••${savedUrl.slice(-8)}`
    : "";

  return (
    <div style={styles.wrapper}>
      <div style={styles.pageHeading}>
        <p style={styles.eyebrow}>
          BANK SETU SECURITY
        </p>

        <h1 style={styles.heading}>
          Advanced Administrator Control
        </h1>

        <p style={styles.subtitle}>
          Protected database and system connection settings
        </p>
      </div>

      <section style={styles.securityCard}>
        <div style={styles.securityHeader}>
          <div>
            <p style={styles.sectionLabel}>
              ADMIN SECURITY
            </p>

            <h2 style={styles.cardTitle}>
              Protected Control
            </h2>
          </div>

          <span
            style={{
              ...styles.lockBadge,
              ...(unlocked
                ? styles.unlockedBadge
                : {}),
            }}
          >
            {unlocked
              ? "🔓 Unlocked"
              : "🔒 Locked"}
          </span>
        </div>

        <p style={styles.securityText}>
          API connection changes require the current
          administrator password. The password is used only
          for Firebase verification and is not stored.
        </p>

        {!unlocked && (
          <button
            type="button"
            style={styles.unlockButton}
            onClick={() =>
              setShowAuthBox(true)
            }
          >
            🔐 Verify Administrator
          </button>
        )}

        {unlocked && (
          <button
            type="button"
            style={styles.lockButton}
            onClick={lockControl}
          >
            🔒 Lock Administrator Control
          </button>
        )}
      </section>

      {showAuthBox && !unlocked && (
        <section style={styles.authCard}>
          <p style={styles.sectionLabel}>
            ADMIN VERIFICATION
          </p>

          <h2 style={styles.authTitle}>
            Confirm Administrator Password
          </h2>

          <p style={styles.authText}>
            Enter the password of the currently logged-in
            administrator account.
          </p>

          <input
            type="password"
            value={password}
            placeholder="Current admin password"
            onChange={(e) =>
              setPassword(e.target.value)
            }
            style={styles.input}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                unlockAdminControl();
              }
            }}
          />

          <div style={styles.actions}>
            <button
              type="button"
              style={styles.verifyButton}
              onClick={unlockAdminControl}
              disabled={authLoading}
            >
              {authLoading
                ? "Verifying..."
                : "Verify & Unlock"}
            </button>

            <button
              type="button"
              style={styles.cancelButton}
              onClick={() => {
                setShowAuthBox(false);
                setPassword("");
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <p style={styles.sectionLabel}>
              GOOGLE SHEET DATABASE
            </p>

            <h2 style={styles.cardTitle}>
              Apps Script Web App
            </h2>
          </div>

          <StatusBadge status={status} />
        </div>

        {savedUrl && !unlocked && (
          <div style={styles.savedBox}>
            <span style={styles.savedLabel}>
              ACTIVE CONNECTION
            </span>

            <span style={styles.savedUrl}>
              {maskedUrl}
            </span>
          </div>
        )}

        {unlocked && (
          <>
            <label style={styles.label}>
              Apps Script Web App URL
            </label>

            <input
              type="url"
              value={apiUrl}
              placeholder="https://script.google.com/macros/s/.../exec"
              onChange={(e) =>
                setApiUrl(e.target.value)
              }
              style={styles.input}
            />
          </>
        )}

        {!savedUrl && !unlocked && (
          <div style={styles.noConnection}>
            No Google Sheet API connection saved.
          </div>
        )}

        {message && (
          <div
            style={{
              ...styles.message,
              ...(status === "error"
                ? styles.errorMessage
                : {}),
            }}
          >
            {message}
          </div>
        )}

        <div
          className="advanced-actions"
          style={styles.actions}
        >
          <button
            type="button"
            style={styles.testButton}
            onClick={testConnection}
          >
            {status === "testing"
              ? "Testing..."
              : "Test Connection"}
          </button>

          {unlocked && (
            <button
              type="button"
              style={styles.saveButton}
              onClick={saveConnection}
            >
              Save / Update Connection
            </button>
          )}

          {savedUrl && (
            <button
              type="button"
              style={styles.removeButton}
              onClick={requestRemove}
            >
              Remove Connection
            </button>
          )}
        </div>

        {removeMode && unlocked && (
          <div style={styles.dangerZone}>
            <p style={styles.dangerTitle}>
              ⚠ Dangerous Action
            </p>

            <p style={styles.dangerText}>
              Removing this connection will disable Google
              Sheet save, search and update functions.
            </p>

            <p style={styles.dangerText}>
              Type{" "}
              <strong>REMOVE API</strong>{" "}
              below to continue.
            </p>

            <input
              type="text"
              value={removeText}
              placeholder="Type REMOVE API"
              onChange={(e) =>
                setRemoveText(e.target.value)
              }
              style={styles.dangerInput}
            />

            <div style={styles.actions}>
              <button
                type="button"
                style={styles.finalRemoveButton}
                onClick={removeConnection}
              >
                Permanently Remove Connection
              </button>

              <button
                type="button"
                style={styles.cancelButton}
                onClick={() => {
                  setRemoveMode(false);
                  setRemoveText("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <style>
        {`
          @media (max-width: 760px) {
            .advanced-actions {
              flex-direction: column !important;
            }

            .advanced-actions button {
              width: 100% !important;
            }
          }
        `}
      </style>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status:
    | "not-connected"
    | "testing"
    | "connected"
    | "error";
}) {
  let label = "Not Tested";
  let badgeStyle = styles.statusNeutral;

  if (status === "testing") {
    label = "Testing...";
    badgeStyle = styles.statusTesting;
  }

  if (status === "connected") {
    label = "Connected";
    badgeStyle = styles.statusConnected;
  }

  if (status === "error") {
    label = "Connection Error";
    badgeStyle = styles.statusError;
  }

  return (
    <span
      style={{
        ...styles.statusBadge,
        ...badgeStyle,
      }}
    >
      {label}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    width: "100%",
    maxWidth: "1050px",
    margin: "0 auto",
  },

  pageHeading: {
    textAlign: "center",
    marginBottom: "22px",
  },

  eyebrow: {
    margin: 0,
    color: "#45dfc5",
    fontSize: "8px",
    fontWeight: 800,
    letterSpacing: "1.8px",
  },

  heading: {
    margin: "6px 0",
    color: "#fff",
    fontSize: "27px",
  },

  subtitle: {
    margin: 0,
    color: "#91a7b3",
    fontSize: "10px",
  },

  securityCard: {
    padding: "20px",
    marginBottom: "16px",
    borderRadius: "18px",
    background:
      "linear-gradient(145deg,#0b2631,#0c313d)",
    border:
      "1px solid rgba(54,220,193,0.12)",
  },

  securityHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
  },

  sectionLabel: {
    margin: 0,
    color: "#45dfc5",
    fontSize: "8px",
    fontWeight: 800,
    letterSpacing: "1.4px",
  },

  cardTitle: {
    margin: "6px 0 0",
    color: "#fff",
    fontSize: "19px",
  },

  securityText: {
    color: "#94a8b4",
    fontSize: "9px",
    lineHeight: 1.6,
  },

  lockBadge: {
    padding: "7px 11px",
    borderRadius: "999px",
    color: "#f0b95d",
    background:
      "rgba(240,185,93,0.08)",
    fontSize: "8px",
    fontWeight: 700,
  },

  unlockedBadge: {
    color: "#45dfc5",
    background:
      "rgba(69,223,197,0.08)",
  },

  unlockButton: {
    height: "42px",
    padding: "0 16px",
    border: "none",
    borderRadius: "10px",
    background:
      "linear-gradient(90deg,#34dcbf,#2faade)",
    color: "#032229",
    fontWeight: 800,
    cursor: "pointer",
  },

  lockButton: {
    height: "42px",
    padding: "0 16px",
    borderRadius: "10px",
    border:
      "1px solid rgba(255,255,255,0.08)",
    background:
      "rgba(255,255,255,0.04)",
    color: "#d7e4e9",
    cursor: "pointer",
  },

  authCard: {
    padding: "20px",
    marginBottom: "16px",
    borderRadius: "18px",
    background: "#092530",
    border:
      "1px solid rgba(255,255,255,0.06)",
  },

  authTitle: {
    margin: "6px 0",
    color: "#fff",
    fontSize: "18px",
  },

  authText: {
    color: "#91a6b2",
    fontSize: "9px",
  },

  card: {
    padding: "24px",
    borderRadius: "19px",
    background:
      "linear-gradient(145deg,#09232e,#0b2a36)",
    border:
      "1px solid rgba(255,255,255,0.06)",
  },

  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    marginBottom: "18px",
  },

  label: {
    display: "block",
    marginBottom: "7px",
    color: "#dce7eb",
    fontSize: "10px",
    fontWeight: 700,
  },

  input: {
    boxSizing: "border-box",
    width: "100%",
    height: "50px",
    padding: "0 14px",
    outline: "none",
    borderRadius: "11px",
    border:
      "1px solid rgba(255,255,255,0.08)",
    background: "#0a303c",
    color: "#fff",
  },

  savedBox: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    padding: "13px",
    borderRadius: "11px",
    background:
      "rgba(255,255,255,0.035)",
  },

  savedLabel: {
    color: "#45dfc5",
    fontSize: "7px",
    fontWeight: 800,
  },

  savedUrl: {
    color: "#a7bac4",
    fontSize: "9px",
    wordBreak: "break-all",
  },

  noConnection: {
    padding: "15px",
    borderRadius: "11px",
    background:
      "rgba(255,255,255,0.03)",
    color: "#8fa5b2",
    fontSize: "9px",
  },

  actions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    marginTop: "16px",
  },

  verifyButton: {
    height: "43px",
    padding: "0 18px",
    border: "none",
    borderRadius: "10px",
    background:
      "linear-gradient(90deg,#34dcbf,#2faade)",
    color: "#032229",
    fontWeight: 800,
    cursor: "pointer",
  },

  saveButton: {
    height: "43px",
    padding: "0 18px",
    border: "none",
    borderRadius: "10px",
    background:
      "linear-gradient(90deg,#34dcbf,#2faade)",
    color: "#032229",
    fontWeight: 800,
    cursor: "pointer",
  },

  testButton: {
    height: "43px",
    padding: "0 18px",
    borderRadius: "10px",
    border:
      "1px solid rgba(55,220,195,0.18)",
    background:
      "rgba(55,220,195,0.06)",
    color: "#4be1c7",
    cursor: "pointer",
    fontWeight: 700,
  },

  removeButton: {
    height: "43px",
    padding: "0 18px",
    borderRadius: "10px",
    border:
      "1px solid rgba(255,95,95,0.18)",
    background:
      "rgba(255,95,95,0.05)",
    color: "#ff9292",
    cursor: "pointer",
    fontWeight: 700,
  },

  cancelButton: {
    height: "43px",
    padding: "0 18px",
    borderRadius: "10px",
    border:
      "1px solid rgba(255,255,255,0.08)",
    background:
      "rgba(255,255,255,0.04)",
    color: "#c9d7de",
    cursor: "pointer",
  },

  message: {
    marginTop: "14px",
    padding: "11px 13px",
    borderRadius: "10px",
    background:
      "rgba(55,220,195,0.07)",
    color: "#4be2c8",
    fontSize: "9px",
  },

  errorMessage: {
    background:
      "rgba(255,90,90,0.07)",
    color: "#ff9a9a",
  },

  dangerZone: {
    marginTop: "20px",
    padding: "17px",
    borderRadius: "13px",
    border:
      "1px solid rgba(255,80,80,0.17)",
    background:
      "rgba(255,70,70,0.045)",
  },

  dangerTitle: {
    margin: 0,
    color: "#ff8e8e",
    fontWeight: 800,
  },

  dangerText: {
    color: "#b6a4a4",
    fontSize: "9px",
  },

  dangerInput: {
    boxSizing: "border-box",
    width: "100%",
    height: "45px",
    padding: "0 13px",
    borderRadius: "10px",
    border:
      "1px solid rgba(255,90,90,0.18)",
    outline: "none",
    background: "#26191d",
    color: "#fff",
  },

  finalRemoveButton: {
    height: "43px",
    padding: "0 18px",
    border: "none",
    borderRadius: "10px",
    background: "#c83f4c",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },

  statusBadge: {
    padding: "7px 10px",
    borderRadius: "999px",
    fontSize: "8px",
    fontWeight: 700,
  },

  statusNeutral: {
    background:
      "rgba(255,255,255,0.04)",
    color: "#a9b9c1",
  },

  statusTesting: {
    background:
      "rgba(239,186,86,0.08)",
    color: "#efba56",
  },

  statusConnected: {
    background:
      "rgba(55,220,195,0.08)",
    color: "#45dfc5",
  },

  statusError: {
    background:
      "rgba(255,100,100,0.07)",
    color: "#ff9090",
  },
};

export default Settings;