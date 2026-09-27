import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "./firebase";
import Dashboard from "./Dashboard";
import Signup from "./Signup";

import "./App.css";

function App() {
  const [screen, setScreen] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const [error, setError] = useState("");

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          setIsLoggedIn(false);
          setCheckingSession(false);
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          await signOut(auth);

          setError(
            "Your user profile was not found. Please contact the administrator."
          );

          setIsLoggedIn(false);
          setCheckingSession(false);
          return;
        }

        const data = userSnap.data();

        if (data.status !== "approved") {
          await signOut(auth);

          setError(
            "Your account is waiting for administrator approval."
          );

          setIsLoggedIn(false);
          setCheckingSession(false);
          return;
        }

        if (data.subscriptionStatus !== "active") {
          await signOut(auth);

          setError(
            "Your Bank Setu subscription is not active."
          );

          setIsLoggedIn(false);
          setCheckingSession(false);
          return;
        }

        setIsLoggedIn(true);
      } catch (err) {
        console.error("Session check error:", err);

        setError("Unable to verify your account.");
        setIsLoggedIn(false);
      } finally {
        setCheckingSession(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
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
        await signOut(auth);

        setError(
          "Your Bank Setu profile was not found. Please contact the administrator."
        );

        return;
      }

      const userData = userSnap.data();

      if (userData.status !== "approved") {
        await signOut(auth);

        setError(
          "Your registration is pending administrator approval."
        );

        return;
      }

      if (userData.subscriptionStatus !== "active") {
        await signOut(auth);

        setError(
          "Your subscription is inactive. Please contact the administrator."
        );

        return;
      }

      setIsLoggedIn(true);
    } catch (err: any) {
      console.error("Login error:", err);

      if (err.code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (err.code === "auth/too-many-requests") {
        setError(
          "Too many login attempts. Please try again later."
        );
      } else if (err.code === "auth/network-request-failed") {
        setError(
          "Internet connection problem. Please try again."
        );
      } else if (err.code === "permission-denied") {
        setError(
          "Bank Setu could not verify your account permissions."
        );
      } else {
        setError(
          `Login failed: ${err.code || "unknown-error"}`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);

      setIsLoggedIn(false);

      setEmail("");
      setPassword("");
      setError("");

      setScreen("login");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

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

  if (isLoggedIn) {
    return <Dashboard onLogout={handleLogout} />;
  }

  if (screen === "signup") {
    return (
      <Signup
        onBackToLogin={() => {
          setScreen("login");
          setError("");
        }}
      />
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

            <p>Smart CSP Management Platform</p>
          </div>

          <div className="welcome">
            <span className="welcome-chip">
              SECURE ACCESS
            </span>

            <h2>Welcome back</h2>

            <p>
              Sign in to manage your Bank Setu workspace.
            </p>
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
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="field">
              <div className="field-label-row">
                <label>Password</label>

                <button
                  type="button"
                  className="forgot-link"
                >
                  Forgot password?
                </button>
              </div>

              <div className="input-box">
                <div className="field-icon">●</div>

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword(
                      !showPassword
                    )
                  }
                >
                  {showPassword
                    ? "Hide"
                    : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div className="form-message error-message">
                <span>!</span>
                {error}
              </div>
            )}

            <div className="login-options">
              <label className="remember">
                <input type="checkbox" />
                <span>
                  Keep me signed in
                </span>
              </label>

              <span className="encrypted">
                ● Secure
              </span>
            </div>

            <button
              className="sign-in"
              type="submit"
              disabled={loading}
            >
              <span>
                {loading
                  ? "Signing in..."
                  : "Sign In"}
              </span>

              {!loading && (
                <span className="arrow">
                  →
                </span>
              )}
            </button>
          </form>

          <div className="signup-section">
            <div className="divider">
              <span></span>
              <p>New to Bank Setu?</p>
              <span></span>
            </div>

            <button
              type="button"
              className="create-account-button"
              onClick={() => {
                setScreen("signup");
                setError("");
              }}
            >
              Create New Account
            </button>

            <p className="approval-note">
              New registrations require administrator approval.
            </p>
          </div>

          <div className="login-footer">
            <span className="status-dot"></span>
            Bank Setu Secure Access
            <span className="footer-separator">
              •
            </span>
            v1.0
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;