import { useState } from "react";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { initializeApp, getApp, deleteApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { doc, setDoc } from "firebase/firestore";

type SignupProps = {
  onBackToLogin: () => void;
};

function Signup({ onBackToLogin }: SignupProps) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!mobile.trim()) {
      setError("Please enter your mobile number.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const registrationApp = initializeApp(getApp().options, `banksetu-registration-${Date.now()}`);
    const registrationAuth = getAuth(registrationApp);
    const registrationDb = getFirestore(registrationApp);
    try {
      setLoading(true);

      const userCredential = await createUserWithEmailAndPassword(
        registrationAuth,
        email.trim(),
        password
      );

      const user = userCredential.user;

      await setDoc(doc(registrationDb, "users", user.uid), {
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        role: "user",
        status: "pending",
        subscriptionStatus: "inactive",
        createdAt: new Date().toISOString(),
      });

      await signOut(registrationAuth);
      setSuccess(
        "Registration successful. Your account is waiting for admin approval."
      );

      setName("");
      setMobile("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("Signup error:", err);

      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email.");
      } else if (err.code === "auth/weak-password") {
        setError("Please choose a stronger password.");
      } else if (err.code === "permission-denied") {
        setError("Permission denied while creating profile.");
      } else {
        setError(`Registration failed: ${err.code || "unknown-error"}`);
      }
    } finally {
      await signOut(registrationAuth).catch(() => {});
      await deleteApp(registrationApp);
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="ambient ambient-one"></div>
      <div className="ambient ambient-two"></div>

      <section className="login-shell">
        <div className="login-card">
          <div className="banksetu-logo"></div>

          <div className="brand">
            <h1>
              BANK <span>SETU</span>
            </h1>
            <p>Smart CSP Management Platform</p>
          </div>

          <div className="welcome">
            <span className="welcome-chip">CREATE ACCOUNT</span>
            <h2>Join Bank Setu</h2>
            <p>Register your account for administrator approval.</p>
          </div>

          <form onSubmit={handleSignup}>
            <div className="field">
              <label>Full Name</label>

              <div className="input-box">
                <div className="field-icon">👤</div>

                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Mobile Number</label>

              <div className="input-box">
                <div className="field-icon">☎</div>

                <input
                  type="tel"
                  placeholder="Enter your mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Email</label>

              <div className="input-box">
                <div className="field-icon">✉</div>

                <input
                  type="email"
                  placeholder="Enter your email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Password</label>

              <div className="input-box">
                <div className="field-icon">●</div>

                <input
                  type="password"
                  placeholder="Create a password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Confirm Password</label>

              <div className="input-box">
                <div className="field-icon">●</div>

                <input
                  type="password"
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="form-message error-message">
                <span>!</span>
                {error}
              </div>
            )}

            {success && (
              <div
                className="form-message"
                style={{
                  color: "#38e8c7",
                  background: "rgba(56,232,199,0.08)",
                  border: "1px solid rgba(56,232,199,0.15)",
                }}
              >
                {success}
              </div>
            )}

            <button
              className="sign-in"
              type="submit"
              disabled={loading}
            >
              <span>
                {loading ? "Creating account..." : "Create Account"}
              </span>

              {!loading && <span className="arrow">→</span>}
            </button>

            <button
              type="button"
              className="create-account-button"
              style={{ marginTop: "12px" }}
              onClick={onBackToLogin}
            >
              Back to Sign In
            </button>
          </form>

          <div className="login-footer">
            <span className="status-dot"></span>
            Registration requires admin approval
          </div>
        </div>
      </section>
    </main>
  );
}

export default Signup;