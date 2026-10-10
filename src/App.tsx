import { enrollOfflineSession, resumeOfflineSession, clearOfflineSession } from "./core/offlineSession";

import { startLocalSync, configureConnectionRecovery, resetSyncSession } from "./core/localData";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";

import { auth, db } from "./firebase";
import { callBankSetuWorker } from "./workerApi";
import Dashboard from "./Dashboard";
import LicenseOnboarding, { getPublicLicenseSettings } from "./LicenseOnboarding";
import { cachedLicenseReceipt, saveLicenseReceipt, verifyLicenseReceipt, type LicenseReceipt } from "./core/licenseReceipt";
import PublicPages from "./PublicPages";
import SoftwareUpdateNotice from "./SoftwareUpdateNotice";
import { setTenantApiUrl, setTenantWorkspaceReady } from "./tenantApi";

import "./App.css";

type BankSetuRole = "admin" | "user";
type UserProfile = {
  role?: string;
  status?: string;
  subscriptionStatus?: string;
  email?: string;
  tenantId?: string;
  licenseRequired?: boolean;
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
const MASTER_OWNER_EMAIL = "banksetu2026@gmail.com";

function getAccessError(profile: UserProfile, authEmail = "", emailVerified = false): string {
  const status = normalize(profile.status);
  const subscriptionStatus = normalize(profile.subscriptionStatus);
  const role = normalize(profile.role);
  const tenantId = String(profile.tenantId || "").trim();

  if (status === "blocked") {
    return "Your Bank Setu account has been blocked by the administrator.";
  }

  if (status !== "approved") {
    return "Your registration is pending administrator approval.";
  }

  if (subscriptionStatus !== "active") {
    return "Your subscription is inactive. Please contact the administrator.";
  }

  // Legacy `user` profiles without a tenant must never inherit the historical
  // master spreadsheet. Operational client accounts are always tenant-bound.
  if (["client_admin", "client_user"].includes(role) && !tenantId) {
    return "This account is not assigned to a client workspace. Contact the Bank Setu administrator.";
  }
  if (["user"].includes(role) && !tenantId) {
    return "This account is not assigned to a client workspace. Contact the Bank Setu administrator.";
  }
  if (tenantId && !["client_admin", "client_user"].includes(role)) {
    return "This account cannot use a client workspace. Contact the Bank Setu administrator.";
  }
  // Legacy `admin` access points to the shared Master Sheet. Keep it only for
  // the verified Bank Setu owner account; old client admins must be migrated.
  if (role === "admin" && (normalize(authEmail) !== MASTER_OWNER_EMAIL || !emailVerified)) {
    return "This administrator account is not the verified Master Admin. Contact the Bank Setu owner.";
  }

  return "";
}

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<BankSetuRole>("user");
  const [accountRole, setAccountRole] = useState("user");
  const [licenseWelcome, setLicenseWelcome] = useState<Awaited<ReturnType<typeof getPublicLicenseSettings>>>(null);
  const [showLicenseWelcome, setShowLicenseWelcome] = useState(true);
  const [licenseReadOnly, setLicenseReadOnly] = useState(false);
  const [licenseWarning, setLicenseWarning] = useState("");
  const [knownAccount, setKnownAccount] = useState(() => { try { return localStorage.getItem("bankSetuKnownAccount") === "true"; } catch { return false; } });


  const loginAttemptRef = useRef(false);
  const activeProfile = useRef<UserProfile | null>(null);
  const verifiedNavigation = useRef(false);
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ownerBootstrapAttemptRef = useRef(false);
  const profileUnsubscribeRef = useRef<Unsubscribe | null>(null);
  const workspaceRequestRef = useRef(0);
  const licenseRequestRef = useRef(0);
  const lastOnlineLicenseDay = useRef("");

  useEffect(() => {
    void getPublicLicenseSettings().then(settings => {
      if (settings?.uiEnabled && settings.turnstileSiteKey) setLicenseWelcome(settings);
    }).catch(() => { /* Existing login stays available during a backend outage. */ });
  }, []);

  const clearProfileListener = useCallback(() => {
    if (profileUnsubscribeRef.current) {
      profileUnsubscribeRef.current();
      profileUnsubscribeRef.current = null;
    }
  }, []);

  const applyProfile = useCallback((profile: UserProfile) => {
    const normalizedRole = normalize(profile.role);
    const previous=activeProfile.current;
    if((!previous && sessionStorage.getItem("bankSetuWorkspaceReady")!=="true") || (previous && (previous.role!==profile.role || previous.tenantId!==profile.tenantId))){
      setTenantWorkspaceReady(false);sessionStorage.removeItem("bankSetuConnectionId");sessionStorage.removeItem("bankSetuBridgeUrl");sessionStorage.removeItem("bankSetuMasterLocalEnabled");
    }
    activeProfile.current=profile;
    sessionStorage.setItem("bankSetuLicenseRequired", profile.licenseRequired === true ? "true" : "false");
    setAccountRole(normalizedRole || "user");
    sessionStorage.setItem("bankSetuAccountRole", normalizedRole || "user");
    const role: BankSetuRole = ["admin", "master_owner", "client_admin"].includes(normalizedRole)
      ? "admin"
      : "user";
    setUserRole(role);
    sessionStorage.setItem("bankSetuRole", role);
    if (!["master_owner","admin"].includes(normalizedRole) && typeof profile.tenantId === "string" && profile.tenantId.trim()) {
      sessionStorage.setItem("bankSetuTenantId", profile.tenantId.trim());
    } else {
      sessionStorage.removeItem("bankSetuTenantId");
    }
    return role;
  }, []);

  const prepareClientWorkspace = useCallback(async (signal?:AbortSignal) => {
    const profile=activeProfile.current;const user=auth.currentUser;
    if(!profile||!user)return;
    const requestId=++workspaceRequestRef.current;
    const role=normalize(profile.role);
    if(!["master_owner","admin","client_admin","client_user"].includes(role))return;
    const stillCurrent=()=>requestId===workspaceRequestRef.current && auth.currentUser?.uid===user.uid && activeProfile.current?.role===profile.role && activeProfile.current?.tenantId===profile.tenantId;
    if(sessionStorage.getItem("bankSetuWorkspaceReady")!=="true"){
      try{await resumeOfflineSession(user.uid,{role,tenantId:String(profile.tenantId||"")});}catch{/* First use needs a verified connection. */}
    }
    if(signal?.aborted||!stillCurrent())return;
    const setup=await callBankSetuWorker<{masterLocalReady?:boolean;masterConnectionId?:string;apiUrl?:string;workspaceStatus?:string;dataApiReady?:boolean;spreadsheetId?:string;photoFolderId?:string;connectionMode?:string;connectionId?:string}>("/get-google-setup",{},signal);
    if(signal?.aborted||!stillCurrent())return;
    const master=["master_owner","admin"].includes(role);
    const ready=master?setup.masterLocalReady&&setup.masterConnectionId&&setup.apiUrl:setup.workspaceStatus==="active"&&setup.dataApiReady&&setup.apiUrl&&setup.spreadsheetId&&setup.photoFolderId;
    if(!ready){
      // A bridge outage must not disconnect an already verified local workspace.
      if((!master&&setup.workspaceStatus!=="active")||(setup.apiUrl&&setup.apiUrl!==sessionStorage.getItem("bankSetuBridgeUrl")))setTenantWorkspaceReady(false);
      throw new Error("Google connection unavailable; local data retained and reconnect will retry.");
    }
    if(master)sessionStorage.setItem("bankSetuMasterLocalEnabled","true");else sessionStorage.removeItem("bankSetuMasterLocalEnabled");
    sessionStorage.setItem("bankSetuConnectionMode",master?"master-local":setup.connectionMode||"oauth");
    sessionStorage.setItem("bankSetuConnectionId",String(master?setup.masterConnectionId:setup.connectionId||setup.spreadsheetId));
    sessionStorage.setItem("bankSetuBridgeUrl",setup.apiUrl!);setTenantApiUrl(setup.apiUrl!);
    setTenantWorkspaceReady(true);
    // Offline grant renewal is independent of online workspace readiness.
    if(master||setup.connectionMode==="option-b")void enrollOfflineSession().catch(()=>undefined);
  }, []);

  const rejectSession = useCallback(async (message: string) => {
    clearTimeout(recoveryTimer.current);verifiedNavigation.current=true;setTenantWorkspaceReady(false);
    if(auth.currentUser) await clearOfflineSession(auth.currentUser.uid).catch(()=>undefined);
    clearProfileListener();activeProfile.current=null;
    sessionStorage.removeItem("bankSetuRole");
    sessionStorage.removeItem("bankSetuTenantId");
    sessionStorage.removeItem("bankSetuAccountRole");sessionStorage.removeItem("bankSetuMasterLocalEnabled");
    setTenantWorkspaceReady(false);
    setUserRole("user");
    setAccountRole("user");
    setIsLoggedIn(false);
    setLoginSuccess(false);
    setError(message);

    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.error("Sign out after access rejection failed:", signOutError);
      }
    }
  }, [clearProfileListener]);

  const checkLicense = useCallback(async (user: User, profile: UserProfile, online: boolean) => {
    const requestId=++licenseRequestRef.current;
    const update=(readOnly:boolean,warning:string)=>{if(auth.currentUser?.uid!==user.uid||requestId!==licenseRequestRef.current)return;sessionStorage.setItem("bankSetuLicenseReadOnly",String(readOnly));setLicenseReadOnly(readOnly);setLicenseWarning(warning);};
    if (profile.licenseRequired !== true) { update(false,""); return; }
    const tenantId = String(profile.tenantId || "");
    if (!tenantId) { update(true,"This account needs a verified tenant license."); return; }
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(Date.now());
    if (online) {
      try {
        if(lastOnlineLicenseDay.current===`${user.uid}:${tenantId}:${day}`){
          const cached=await cachedLicenseReceipt(user.uid,tenantId).catch(()=>null);
          if(cached){update(false,"");return;}
          if(sessionStorage.getItem("bankSetuLicenseReadOnly")==="true"){update(true,"Renew or activate your license to resume customer changes.");return;}
        }
        const result = await callBankSetuWorker<{receipt:LicenseReceipt|null;view:{canWrite:boolean;state:string}}>("/license-me", {});
        if (auth.currentUser?.uid !== user.uid || requestId!==licenseRequestRef.current) return;
        if (result.receipt) {
          await verifyLicenseReceipt(result.receipt, user.uid, tenantId);
          try { saveLicenseReceipt(result.receipt, user.uid, tenantId); } catch { /* Online verification remains authoritative. */ }
        }
        lastOnlineLicenseDay.current=`${user.uid}:${tenantId}:${day}`;
        update(!result.view.canWrite || !result.receipt,result.view.canWrite&&result.receipt?"":"Renew or upgrade your license to resume customer changes.");
        return;
      } catch { /* A previously signed, unexpired receipt supports a temporary outage. */ }
    }
    try {
      const receipt = await cachedLicenseReceipt(user.uid, tenantId);
      update(!["active", "expiring_soon"].includes(receipt.state),"");
    } catch {
      update(true,"Connect to the internet to verify your Bank Setu license. Existing records and backup remain accessible.");
    }
  }, []);

  const watchUserProfile = useCallback((user: User) => {
    clearProfileListener();

    const userRef = doc(db, "users", user.uid);
    profileUnsubscribeRef.current = onSnapshot(
      userRef,
      { includeMetadataChanges: true },
      async (snapshot) => {
        if(auth.currentUser?.uid!==user.uid)return;
        if(navigator.onLine && snapshot.metadata.fromCache)return;
        const existingProfile = snapshot.exists() ? snapshot.data() as UserProfile : null;
        const mayBootstrapOwner = normalize(user.email) === MASTER_OWNER_EMAIL &&
          user.emailVerified &&
          !ownerBootstrapAttemptRef.current &&
          (!existingProfile || normalize(existingProfile.role) === "admin");
        if (mayBootstrapOwner) {
          ownerBootstrapAttemptRef.current = true;
          setError("Setting up the verified Bank Setu Master Admin account…");
          try {
            await callBankSetuWorker("/bootstrap-master-owner", {});
            return;
          } catch (bootstrapError: unknown) {
            const code = String((bootstrapError as { code?: string }).code || "");
            if (!(existingProfile && code.endsWith("already-exists"))) {
              await rejectSession(bootstrapError instanceof Error
                ? bootstrapError.message
                : "Unable to set up the Master Admin account.");
              setCheckingSession(false);
              return;
            }
          }
        }
        if (!snapshot.exists()) {
          await rejectSession(
            "Your Bank Setu profile was not found. Please contact the administrator."
          );
          setCheckingSession(false);
          return;
        }

        const profile = existingProfile as UserProfile;
        applyProfile(profile);

        const accessError = getAccessError(profile, user.email || "", user.emailVerified);
        if (accessError) {
          await rejectSession(accessError);
          setCheckingSession(false);
          return;
        }

        verifiedNavigation.current=true;clearTimeout(recoveryTimer.current);
        await checkLicense(user, profile, navigator.onLine);
        if(auth.currentUser?.uid!==user.uid)return;
        setKnownAccount(true);
        try { localStorage.setItem("bankSetuKnownAccount", "true"); } catch { /* Login remains available without persistent UI preference. */ }
        setError("");setIsLoggedIn(true);setLoginSuccess(false);setLoading(false);
        setCheckingSession(false);
      },
      async (snapshotError) => {
        console.error("Profile listener error:", snapshotError);
        await rejectSession("Unable to verify your account permissions.");
        setCheckingSession(false);
      }
    );
  }, [applyProfile, checkLicense, clearProfileListener, rejectSession]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(recoveryTimer.current);verifiedNavigation.current=false;activeProfile.current=null;
      licenseRequestRef.current++;lastOnlineLicenseDay.current="";sessionStorage.removeItem("bankSetuLicenseRequired");sessionStorage.setItem("bankSetuLicenseReadOnly","true");
      workspaceRequestRef.current++;setTenantWorkspaceReady(false);resetSyncSession();
      if (!user) {
        activeProfile.current=null;
        ownerBootstrapAttemptRef.current = false;
        clearProfileListener();
        sessionStorage.removeItem("bankSetuRole");
        sessionStorage.removeItem("bankSetuTenantId");
        sessionStorage.removeItem("bankSetuAccountRole");sessionStorage.removeItem("bankSetuMasterLocalEnabled");
        setTenantWorkspaceReady(false);
        setIsLoggedIn(false);
        setUserRole("user");
        setAccountRole("user");
        setCheckingSession(false);
        return;
      }

      setCheckingSession(true);
      // Stop the previous account's sync lifecycle before validating a switched user.
      setIsLoggedIn(false);
      if(!navigator.onLine){
        void resumeOfflineSession(user.uid).then(async claims=>{
          if(auth.currentUser?.uid!==user.uid)return;
          applyProfile(claims);await checkLicense(user, claims, false);setIsLoggedIn(true);setError("");setCheckingSession(false);
        }).catch(reason=>{setError(reason instanceof Error?reason.message:"Connect to verify your account.");setCheckingSession(false);});
        return;
      }
      watchUserProfile(user);
      recoveryTimer.current=setTimeout(()=>{
        if(verifiedNavigation.current||auth.currentUser?.uid!==user.uid)return;
        void resumeOfflineSession(user.uid).then(async claims=>{
          if(verifiedNavigation.current||auth.currentUser?.uid!==user.uid)return;
          applyProfile(claims);await checkLicense(user, claims, false);verifiedNavigation.current=true;setIsLoggedIn(true);setCheckingSession(false);setError("");
        }).catch(()=>{/* Never bypass verification for a first login or expired grant. */});
      },4000);
    });

    return () => {
      clearTimeout(recoveryTimer.current);unsubscribe();
      clearProfileListener();
    };
  }, [applyProfile, checkLicense, clearProfileListener, watchUserProfile]);

  useEffect(()=>{
    const reconnect=()=>{if(auth.currentUser)watchUserProfile(auth.currentUser);};
    window.addEventListener("online",reconnect);return()=>window.removeEventListener("online",reconnect);
  },[watchUserProfile]);

  useEffect(()=>{
    if(!isLoggedIn)return;
    configureConnectionRecovery(prepareClientWorkspace);
    if(licenseReadOnly){
      void prepareClientWorkspace().catch(()=>{/* A verified offline workspace still permits local viewing and backup. */});
      return()=>configureConnectionRecovery(undefined);
    }
    const stop=startLocalSync();
    return()=>{stop();configureConnectionRecovery(undefined);};
  },[isLoggedIn,licenseReadOnly,prepareClientWorkspace]);

  useEffect(() => {
    const refresh = () => {
      const user = auth.currentUser, profile = activeProfile.current;
      lastOnlineLicenseDay.current="";
      if (user && profile?.licenseRequired) void checkLicense(user, profile, navigator.onLine);
    };
    window.addEventListener("banksetu-license-updated", refresh);
    const online=()=>refresh();
    window.addEventListener("online",online);
    const timer=setInterval(()=>{
      const user=auth.currentUser,profile=activeProfile.current;
      if(!user||!profile?.licenseRequired)return;
      const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(Date.now());
      if(navigator.onLine&&lastOnlineLicenseDay.current!==`${user.uid}:${profile.tenantId}:${day}`)void checkLicense(user,profile,true);
      else void cachedLicenseReceipt(user.uid,String(profile.tenantId||"")).catch(()=>{sessionStorage.setItem("bankSetuLicenseReadOnly","true");setLicenseReadOnly(true);setLicenseWarning("Connect to the internet to verify your Bank Setu license.");});
    },60_000);
    return () => {clearInterval(timer);window.removeEventListener("online",online);window.removeEventListener("banksetu-license-updated", refresh);};
  }, [checkLicense]);

  const handleForgotPassword = async () => {
    setError("");
    setSuccessMessage("");

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter your email address first.");
      return;
    }

    try {
      setResetLoading(true);
      await sendPasswordResetEmail(auth, cleanEmail);
      setSuccessMessage(
        "Password reset link sent. Please check your email inbox or spam folder."
      );
    } catch (error: unknown) {
      const err = error as { code?: string };
      console.error("Password reset error:", err);

      if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many requests. Please try again later.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Internet connection problem. Please try again.");
      } else {
        setError("Unable to send the password reset email. Please try again.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    loginAttemptRef.current = true;

    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      loginAttemptRef.current = false;
      return;
    }

    try {
      setLoading(true);

      await signInWithEmailAndPassword(auth,email.trim(),password);
      // The single profile listener authorizes navigation; no Google work here.
    } catch (error: unknown) {
      const err = error as { code?: string };
      console.error("Login error:", err);

      if (err.code === "auth/user-disabled") {
        setError("Your Bank Setu account has been blocked by the administrator.");
      } else if (err.code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many login attempts. Please try again later.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Internet connection problem. Please try again.");
      } else if (err.code === "permission-denied") {
        setError("Bank Setu could not verify your account permissions.");
      } else {
        setError(`Login failed: ${err.code || "unknown-error"}`);
      }
    } finally {
      loginAttemptRef.current = false;
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      clearProfileListener();
      workspaceRequestRef.current++;activeProfile.current=null;setTenantWorkspaceReady(false);resetSyncSession();
      await signOut(auth);
      sessionStorage.removeItem("bankSetuRole");
      sessionStorage.removeItem("bankSetuTenantId");
      sessionStorage.removeItem("bankSetuAccountRole");sessionStorage.removeItem("bankSetuMasterLocalEnabled");
      setTenantWorkspaceReady(false);
      setIsLoggedIn(false);
      setUserRole("user");
      setAccountRole("user");
      setEmail("");
      setPassword("");
      setError("");
      setSuccessMessage("");
      setLoginSuccess(false);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const publicPath = window.location.pathname.split("/").filter(Boolean).join("/");
  if (publicPath === "about" || publicPath === "privacy-policy" || publicPath === "terms") {
    return <PublicPages />;
  }

  if (checkingSession) {
    return (
      <main className="app-loader">
        <div className="loader-logo">
          <span className="loader-bank">B</span>
          <span className="loader-setu">S</span>
        </div>
        <p>Loading Bank Setu...</p>
      </main>
    );
  }

  if (!isLoggedIn && showLicenseWelcome && licenseWelcome && !knownAccount) {
    return <LicenseOnboarding settings={licenseWelcome} onSignIn={() => setShowLicenseWelcome(false)} />;
  }

  if (loginSuccess) {
    return (
      <main className="login-success-page">
        <div className="login-success-card">
          <div className="login-success-check">✓</div>
          <h2>Login Successful</h2>
          <p>Opening your Bank Setu dashboard...</p>
        </div>
      </main>
    );
  }

  if (isLoggedIn) {
    return (
      <div className={`banksetu-session banksetu-role-${userRole}`}>
        <Dashboard onLogout={handleLogout} userRole={userRole} accountRole={accountRole} licenseReadOnly={licenseReadOnly} licenseWarning={licenseWarning} />
        <SoftwareUpdateNotice />
      </div>
    );
  }

  return (
    <main className="login-page">
      <div className="ambient ambient-one"></div>
      <div className="ambient ambient-two"></div>

      <section className="login-shell">
        <div className="login-card">
          <div className="banksetu-logo" aria-label="Bank Setu">
            <div className="logo-ring">
              <div className="logo-bridge">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>

          <div className="brand">
            <h1>
              BANK <span>SETU</span>
            </h1>
          </div>

          <div className="welcome">
            <h2>Welcome back</h2>
          </div>

          <form onSubmit={handleLogin}>
            <div className="field">
              <label>Email address</label>
              <div className="input-box">
                <div className="field-icon">✉</div>
                <input
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <div className="field-label-row">
                <label>Password</label>
                <button
                  type="button"
                  className="forgot-link"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                >
                  {resetLoading ? "Sending..." : "Forgot password?"}
                </button>
              </div>

              <div className="input-box">
                <div className="field-icon">●</div>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div className="form-message error-message">
                <span>!</span>
                {error}
              </div>
            )}

            {successMessage && (
              <div className="form-message success-message">
                <span>✓</span>
                {successMessage}
              </div>
            )}

            <div className="login-options">
              <label className="remember">
                <input type="checkbox" />
                <span>Keep me signed in</span>
              </label>
              <span className="encrypted">● Secure</span>
            </div>

            <div className="auth-action-row">
              <button className="sign-in" type="submit" disabled={loading}>
                <span>{loading ? "Signing in..." : "Sign In"}</span>
                {!loading && <span className="arrow">→</span>}
              </button>

            </div>
          </form>

          <p className="approval-note compact-approval-note">
            New accounts are created by the Bank Setu administrator.
          </p>

          <div className="login-footer">
            <span className="status-dot"></span>
            Bank Setu Secure Access
            <span className="footer-separator">•</span>
            v1.0
            <span className="footer-separator">•</span>
            <a href="/about" style={{ color: "inherit", textDecoration: "underline" }}>About</a>
            <span className="footer-separator">•</span>
            <a href="/privacy-policy" style={{ color: "inherit", textDecoration: "underline" }}>Privacy Policy</a>
            <span className="footer-separator">•</span>
            <a href="/terms" style={{ color: "inherit", textDecoration: "underline" }}>Terms</a>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
