import { useEffect, useState } from "react";

import type { CSSProperties } from "react";

import {
  

  EmailAuthProvider,

  reauthenticateWithCredential,

} from "firebase/auth";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "./firebase";
import ClientGoogleSetup from "./ClientGoogleSetup";
import { getTenantApiUrl, removeTenantApiUrl, setTenantApiUrl, tenantSettingsPath, tenantSettingsWriteMetadata } from "./tenantApi";
declare const __APP_VERSION__: string;

const CURRENT_APP_VERSION = __APP_VERSION__;
const UPDATE_MANIFEST_URL = "/version.json";

type UpdateManifest = {
  latestVersion: string;
  downloadUrl?: string;
  notes?: string;
};

type AdvancedAdminProps = { allowConnectionSettings?: boolean; isMasterOwner?: boolean; isClientAdmin?: boolean };

function Settings(props: AdvancedAdminProps) {
  return <ConnectionSettings {...props} />;
}

function ConnectionSettings({ allowConnectionSettings = false, isClientAdmin = false }: AdvancedAdminProps) {

  const [apiUrl, setApiUrl] = useState("");

  const [savedUrl, setSavedUrl] = useState("");

  const [status, setStatus] = useState<

    "not-connected" | "testing" | "connected" | "error"

  >("not-connected");

  const [message, setMessage] = useState("");

  const [unlocked, setUnlocked] = useState(false);

  const [password, setPassword] = useState("");

  const [showAuthBox, setShowAuthBox] = useState(false);
  const [authMode, setAuthMode] = useState<"unlock" | "lock">("unlock");

  const [authLoading, setAuthLoading] = useState(false);

  const [removeMode, setRemoveMode] = useState(false);

  const [removeText, setRemoveText] = useState("");

  const [updateChecking, setUpdateChecking] =
    useState(false);
  const [latestVersion, setLatestVersion] =
    useState(CURRENT_APP_VERSION);
  const [updateAvailable, setUpdateAvailable] =
    useState(false);
  const [updateDownloadUrl, setUpdateDownloadUrl] =
    useState("");
  const [updateNotes, setUpdateNotes] =
    useState("");
  const [updateMessage, setUpdateMessage] =
    useState("Check for a new Bank Setu version.");

  useEffect(() => {
    let cancelled = false;

    const loadApiConnection = async () => {
      const user = auth.currentUser;
      const localUrl = getTenantApiUrl();

      if (!user) {
        if (!cancelled) {
          setSavedUrl(localUrl);
          setApiUrl(localUrl);
        }
        return;
      }

      try {
        const settingsRef = doc(db, ...tenantSettingsPath(user.uid));

        const settingsSnap =
          await getDoc(settingsRef);

        const cloudData =
          settingsSnap.exists()
            ? settingsSnap.data()
            : {};

        const cloudUrl =
          typeof cloudData.apiUrl === "string"
            ? cloudData.apiUrl.trim()
            : "";

        const finalUrl =
          cloudUrl || localUrl.trim();

        if (!cancelled) {
          setSavedUrl(finalUrl);
          setApiUrl(finalUrl);
        }

        if (finalUrl) {
          setTenantApiUrl(finalUrl);
        }

        if (!cloudUrl && localUrl.trim()) {
          await setDoc(
            settingsRef,
            {
              apiUrl: localUrl.trim(),
              ...tenantSettingsWriteMetadata(user.uid),
              updatedAt:
                serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (error) {
        console.error(
          "API cloud settings load failed:",
          error
        );

        if (!cancelled) {
          setSavedUrl(localUrl);
          setApiUrl(localUrl);
        }
      }
    };

    void loadApiConnection();

    return () => {
      cancelled = true;
    };
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

      if (authMode === "lock") {
        lockControl();
        setShowAuthBox(false);
        return;
      }

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
    setAuthMode("unlock");

    setUnlocked(false);

    setPassword("");

    setRemoveMode(false);

    setRemoveText("");

    setApiUrl(savedUrl);

    setMessage(

      "Administrator control locked."

    );

  };

  const saveConnection = async () => {
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

    const user = auth.currentUser;

    if (!user) {
      setMessage(
        "Firebase login session is not available. Please login again."
      );
      return;
    }

    try {
      await setDoc(
        doc(db, ...tenantSettingsPath(user.uid)),
        {
          apiUrl: cleanUrl,
          ...tenantSettingsWriteMetadata(user.uid),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setTenantApiUrl(cleanUrl);

      setSavedUrl(cleanUrl);
      setApiUrl(cleanUrl);
      setStatus("not-connected");

      setMessage(
        "Database connection saved to Firebase Cloud successfully."
      );
    } catch (error) {
      console.error(
        "API cloud save failed:",
        error
      );

      setMessage(
        "Database connection could not be saved to Firebase Cloud. Please try again."
      );
    }
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

  const removeConnection = async () => {
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

    const user = auth.currentUser;

    if (!user) {
      setMessage(
        "Firebase login session is not available. Please login again."
      );
      return;
    }

    try {
      await setDoc(
        doc(db, ...tenantSettingsPath(user.uid)),
        {
          apiUrl: "",
          ...tenantSettingsWriteMetadata(user.uid),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      removeTenantApiUrl();

      setSavedUrl("");
      setApiUrl("");
      setStatus("not-connected");
      setRemoveMode(false);
      setRemoveText("");
      setUnlocked(false);

      setMessage(
        "Google Sheet API connection removed from Firebase Cloud."
      );
    } catch (error) {
      console.error(
        "API cloud removal failed:",
        error
      );

      setMessage(
        "Google Sheet API connection could not be removed. Please try again."
      );
    }
  };

  const compareVersions = (
    latest: string,
    current: string
  ) => {
    const latestParts = latest
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);

    const currentParts = current
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);

    const length = Math.max(
      latestParts.length,
      currentParts.length
    );

    for (let index = 0; index < length; index += 1) {
      const latestValue = latestParts[index] || 0;
      const currentValue = currentParts[index] || 0;

      if (latestValue > currentValue) return 1;
      if (latestValue < currentValue) return -1;
    }

    return 0;
  };

  const checkForUpdate = async () => {
    setUpdateChecking(true);
    setUpdateMessage(
      "Checking for a new Bank Setu version..."
    );

    try {
      if (window.bankSetuDesktop) {
        const manifest = await window.bankSetuDesktop.checkUpdate() as {latestVersion: string; notes?: string};
        const current = await window.bankSetuDesktop.version();
        const available = compareVersions(manifest.latestVersion, current) > 0;
        setLatestVersion(manifest.latestVersion);setUpdateAvailable(available);setUpdateNotes(manifest.notes || "");
        setUpdateMessage(available ? `New Windows version ${manifest.latestVersion} is available.` : "Bank Setu is already up to date.");
        return;
      }
      const response = await fetch(
        `${UPDATE_MANIFEST_URL}?t=${Date.now()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(
          "Update manifest could not be loaded."
        );
      }

      const manifest =
        (await response.json()) as UpdateManifest;

      const latest = String(
        manifest.latestVersion ||
          CURRENT_APP_VERSION
      ).trim();

      const hasUpdate =
        compareVersions(
          latest,
          CURRENT_APP_VERSION
        ) > 0;

      setLatestVersion(latest);
      setUpdateAvailable(hasUpdate);
      setUpdateDownloadUrl(
        String(manifest.downloadUrl || "").trim()
      );
      setUpdateNotes(
        String(manifest.notes || "").trim()
      );

      setUpdateMessage(
        hasUpdate
          ? `New version ${latest} is available.`
          : "Bank Setu is already up to date."
      );
    } catch (error) {
      console.error(
        "Update check failed:",
        error
      );

      setUpdateAvailable(false);
      setUpdateMessage(
        "Update information is not available right now."
      );
    } finally {
      setUpdateChecking(false);
    }
  };

  const installUpdate = () => {
    if (window.bankSetuDesktop) {
      setUpdateMessage("Downloading and verifying the signed Windows update…");
      void window.bankSetuDesktop.installUpdate().catch(error => setUpdateMessage(error instanceof Error ? error.message : "Windows update failed. Local database retained."));
      return;
    }
    if (!updateAvailable) {
      setUpdateMessage(
        "No new update is available."
      );
      return;
    }

    if (updateDownloadUrl) {
      window.open(
        updateDownloadUrl,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration().then(registration=>{
        if(registration?.waiting){navigator.serviceWorker.addEventListener("controllerchange",()=>window.location.reload(),{once:true});registration.waiting.postMessage("ACTIVATE_UPDATE");}
        else window.location.reload();
      });
    } else window.location.reload();
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

      {isClientAdmin && <ClientGoogleSetup enabled placement="manage" connectionUnlocked={unlocked} />}

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

            onClick={() => { setAuthMode("unlock"); setPassword(""); setShowAuthBox(true); }}

          >

            🔐 Verify Administrator

          </button>

        )}

        {unlocked && (

          <button

            type="button"

            style={styles.lockButton}

            onClick={() => { setAuthMode("lock"); setPassword(""); setShowAuthBox(true); }}

          >

            🔒 Lock Administrator Control

          </button>

        )}

      </section>

      {showAuthBox && (

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

                : authMode === "lock" ? "Verify & Lock" : "Verify & Unlock"}

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

      {allowConnectionSettings && <section style={styles.card}>
        <p style={styles.sectionLabel}>FIREBASE</p>
        <h2 style={styles.cardTitle}>Account &amp; access connection</h2>
        <p style={styles.securityText}>Firebase handles administrator sign-in and workspace permissions.</p>
        <div style={styles.savedBox}><span style={styles.savedLabel}>{auth.currentUser ? "CONNECTED" : "SIGN-IN REQUIRED"}</span><span style={styles.savedUrl}>{auth.app.options.projectId}</span></div>
      </section>}

      {allowConnectionSettings && <section style={styles.card}>

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

      </section>}


      <section
      style={{
        ...styles.card,
        marginTop: "16px",
      }}
    >
      <div style={styles.cardHeader}>
        <div>
          <p style={styles.sectionLabel}>
            BANK SETU SOFTWARE
          </p>

          <h2 style={styles.cardTitle}>
            App / Software Update
          </h2>
        </div>

        <span
          style={
            updateAvailable
              ? styles.updateAvailableBadge
              : styles.statusNeutral
          }
        >
          {updateAvailable
            ? "NEW UPDATE"
            : "UP TO DATE"}
        </span>
      </div>

      <div style={styles.versionGrid}>
        <div style={styles.versionBox}>
          <span style={styles.savedLabel}>
            CURRENT VERSION
          </span>
          <strong style={styles.versionValue}>
            v{CURRENT_APP_VERSION}
          </strong>
        </div>

        <div style={styles.versionBox}>
          <span style={styles.savedLabel}>
            LATEST VERSION
          </span>
          <strong style={styles.versionValue}>
            v{latestVersion}
          </strong>
        </div>
      </div>

      <p style={styles.updateText}>
        {updateMessage}
      </p>

      {updateNotes && (
        <div style={styles.updateNotes}>
          {updateNotes}
        </div>
      )}

      <div
        className="advanced-actions"
        style={styles.actions}
      >
        <button
          type="button"
          style={styles.testButton}
          onClick={checkForUpdate}
          disabled={updateChecking}
        >
          {updateChecking
            ? "Checking..."
            : "Check for Update"}
        </button>

        {updateAvailable && (
          <button
            type="button"
            style={styles.saveButton}
            onClick={installUpdate}
          >
            Update Now
          </button>
        )}
      </div>

      <p style={styles.updateHint}>
        Web version: the latest deployed build is loaded after update.
        Future Windows/EXE or APK builds can use the same version
        manifest with an installer/download URL.
      </p>
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

  versionGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "14px",
  },

  versionBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "13px",
    borderRadius: "11px",
    background:
      "rgba(255,255,255,0.035)",
  },

  versionValue: {
    color: "#ffffff",
    fontSize: "16px",
  },

  updateText: {
    margin: "0",
    color: "#a7bac4",
    fontSize: "10px",
    lineHeight: 1.6,
  },

  updateNotes: {
    marginTop: "12px",
    padding: "12px 13px",
    borderRadius: "10px",
    background:
      "rgba(69,223,197,0.055)",
    color: "#b9d9d3",
    fontSize: "9px",
    lineHeight: 1.6,
  },

  updateHint: {
    margin: "14px 0 0",
    color: "#718c99",
    fontSize: "8px",
    lineHeight: 1.6,
  },

  updateAvailableBadge: {
    padding: "7px 10px",
    borderRadius: "999px",
    fontSize: "8px",
    fontWeight: 800,
    background:
      "rgba(69,223,197,0.10)",
    color: "#45dfc5",
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
