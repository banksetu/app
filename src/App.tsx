import { enrollOfflineSession, resumeOfflineSession, clearOfflineSession } from "./core/offlineSession";

import { syncNow } from "./core/localData";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, type Unsubscribe } from "firebase/firestore";

import { auth, db } from "./firebase";
import { callBankSetuWorker } from "./workerApi";
import Dashboard from "./Dashboard";
import PublicPages from "./PublicPages";
import { removeTenantApiUrl, setTenantApiUrl, setTenantWorkspaceReady } from "./tenantApi";

import "./App.css";

type BankSetuRole = "admin" | "user";
type UserProfile = {
  role?: string;
  status?: string;
  subscriptionStatus?: string;
  email?: string;
  tenantId?: string;
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

  const loginAttemptRef = useRef(false);
  const ownerBootstrapAttemptRef = useRef(false);
  const profileUnsubscribeRef = useRef<Unsubscribe | null>(null);

  const clearProfileListener = useCallback(() => {
    if (profileUnsubscribeRef.current) {
      profileUnsubscribeRef.current();
      profileUnsubscribeRef.current = null;
    }
  }, []);

  const applyProfile = useCallback((profile: UserProfile) => {
    const normalizedRole = normalize(profile.role);
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

  const prepareClientWorkspace = useCallback(async (profile: UserProfile) => {
    const role = normalize(profile.role);
    if(["master_owner","admin"].includes(role)) {
      sessionStorage.removeItem("bankSetuMasterLocalEnabled");sessionStorage.setItem("bankSetuConnectionMode","oauth");sessionStorage.removeItem("bankSetuConnectionId");sessionStorage.removeItem("bankSetuBridgeUrl");setTenantWorkspaceReady(false);
      try {
        const setup=await callBankSetuWorker<{masterLocalReady?:boolean;masterConnectionId?:string;apiUrl?:string}>("/get-google-setup",{});
        if(setup.masterLocalReady&&setup.masterConnectionId&&setup.apiUrl){
          sessionStorage.setItem("bankSetuMasterLocalEnabled","true");sessionStorage.setItem("bankSetuConnectionMode","master-local");sessionStorage.setItem("bankSetuConnectionId",setup.masterConnectionId);sessionStorage.setItem("bankSetuBridgeUrl",setup.apiUrl);setTenantApiUrl(setup.apiUrl);setTenantWorkspaceReady(true);await enrollOfflineSession();
        }
      }catch(error){console.error("Master local sync readiness:",error);sessionStorage.removeItem("bankSetuMasterLocalEnabled");}
      return;
    }
    sessionStorage.removeItem("bankSetuMasterLocalEnabled");
    if (!["client_admin", "client_user"].includes(role)) {
      setTenantWorkspaceReady(false);
      return;
    }
    setTenantWorkspaceReady(false);
    removeTenantApiUrl();
    try {
      const setup = await callBankSetuWorker<{
        apiUrl?: string; spreadsheetId?: string; photoFolderId?: string; dataApiReady?: boolean; workspaceStatus?: string; connectionMode?: string; connectionId?: string;
      }>("/get-google-setup", {});
      if (setup.workspaceStatus === "active" && setup.dataApiReady && setup.apiUrl && setup.spreadsheetId && setup.photoFolderId) {
        sessionStorage.setItem("bankSetuOfflineUntil", String(Date.now()+8*60*60*1000));
        sessionStorage.setItem("bankSetuConnectionMode", setup.connectionMode || "oauth");
        sessionStorage.setItem("bankSetuConnectionId", setup.connectionId || setup.spreadsheetId);
        sessionStorage.setItem("bankSetuBridgeUrl", setup.apiUrl);
        setTenantApiUrl(setup.apiUrl);
        setTenantWorkspaceReady(true);
        if(setup.connectionMode === "option-b") await enrollOfflineSession();
      }
    } catch (workspaceError) {
      console.error("Client workspace check failed; customer APIs remain disabled:", workspaceError);
    }
  }, []);

  const rejectSession = useCallback(async (message: string) => {
    if(auth.currentUser) await clearOfflineSession(auth.currentUser.uid).catch(()=>undefined);
    clearProfileListener();
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

  const watchUserProfile = useCallback((user: User) => {
    clearProfileListener();

    const userRef = doc(db, "users", user.uid);
    profileUnsubscribeRef.current = onSnapshot(
      userRef,
      async (snapshot) => {
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

        await prepareClientWorkspace(profile);

        if (!loginAttemptRef.current) {
          setError("");
          setIsLoggedIn(true);
        }

        setCheckingSession(false);
      },
      async (snapshotError) => {
        console.error("Profile listener error:", snapshotError);
        await rejectSession("Unable to verify your account permissions.");
        setCheckingSession(false);
      }
    );
  }, [applyProfile, clearProfileListener, prepareClientWorkspace, rejectSession]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
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
      if(!navigator.onLine){
        void resumeOfflineSession(user.uid).then(claims=>{
          if(auth.currentUser?.uid!==user.uid)return;
          applyProfile(claims);setIsLoggedIn(true);setError("");setCheckingSession(false);
        }).catch(reason=>{setError(reason instanceof Error?reason.message:"Connect to verify your account.");setCheckingSession(false);});
        return;
      }
      watchUserProfile(user);
    });

    return () => {
      unsubscribe();
      clearProfileListener();
    };
  }, [applyProfile, clearProfileListener, watchUserProfile]);

  useEffect(()=>{
    const reconnect=()=>{if(auth.currentUser)watchUserProfile(auth.currentUser);};
    window.addEventListener("online",reconnect);return()=>window.removeEventListener("online",reconnect);
  },[watchUserProfile]);

  useEffect(()=>{
    if(!isLoggedIn)return;
    const timer=setInterval(()=>{if(navigator.onLine && sessionStorage.getItem("bankSetuConnectionMode")==="option-b")void enrollOfflineSession().catch(()=>undefined);},30*60*1000);
    return()=>clearInterval(timer);
  },[isLoggedIn]);

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

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const userRef = doc(db, "users", credential.user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await rejectSession(
          "Your Bank Setu profile was not found. Please contact the administrator."
        );
        return;
      }

      const userData = userSnap.data() as UserProfile;
      applyProfile(userData);

      const accessError = getAccessError(userData, credential.user.email || "", credential.user.emailVerified);
      if (accessError) {
        await rejectSession(accessError);
        return;
      }

      await prepareClientWorkspace(userData);

      setLoginSuccess(true);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setIsLoggedIn(true);
      setLoginSuccess(false);
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
      await Promise.race([syncNow().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 3000))]);
      clearProfileListener();
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
        <Dashboard onLogout={handleLogout} userRole={userRole} accountRole={accountRole} />
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
