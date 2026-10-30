import { useState } from "react";
import "./LoginExperience.css";

type LoginExperienceProps = {
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  resetLoading: boolean;
  error: string;
  successMessage: string;
  pricingAvailable: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onForgotPassword: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onPricing: () => void;
};

const PRICING_TRANSITION_MS = 720;

export default function LoginExperience({
  email,
  password,
  showPassword,
  loading,
  resetLoading,
  error,
  successMessage,
  pricingAvailable,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onForgotPassword,
  onSubmit,
  onPricing,
}: LoginExperienceProps) {
  const [pricingTransition, setPricingTransition] = useState(false);

  const openPricing = () => {
    if (!pricingAvailable || pricingTransition) return;
    setPricingTransition(true);
    window.setTimeout(onPricing, PRICING_TRANSITION_MS);
  };

  return (
    <main className="premium-login-page">
      <div className="premium-login-sky" aria-hidden="true"><span className="premium-cloud premium-cloud-one" /><span className="premium-cloud premium-cloud-two" /><span className="premium-cloud premium-cloud-three" /><span className="premium-orbit premium-orbit-one" /><span className="premium-orbit premium-orbit-two" /></div>

      <section className="premium-login-visual" aria-hidden="true">
        <div className="premium-scene-grid" /><div className="premium-scene-glow premium-scene-glow-one" /><div className="premium-scene-glow premium-scene-glow-two" />
        <div className="premium-logo-stage">
          <span className="premium-energy-ring premium-energy-ring-one" /><span className="premium-energy-ring premium-energy-ring-two" /><span className="premium-energy-ring premium-energy-ring-three" />
          <div className="premium-logo-halo"><img src="/banksetu-logo.png" alt="" /></div>
          <span className="premium-floating-icon premium-floating-icon-one">⌂</span><span className="premium-floating-icon premium-floating-icon-two">▣</span><span className="premium-floating-icon premium-floating-icon-three">◈</span><span className="premium-floating-icon premium-floating-icon-four">✓</span>
        </div>
        <div className="premium-visual-copy"><span className="premium-kicker">SMART CSP SOLUTION</span><h1>Connecting People<br /><strong>to Better Banking</strong></h1><p>Secure access to your banking workspace, wherever your business works.</p><div className="premium-feature-row"><span>Secure &amp; Reliable</span><span>Multi-Bank Support</span><span>Anywhere Access</span></div></div>
      </section>

      <section className="premium-login-panel">
        <div className="premium-login-card">
          <div className="premium-login-brand"><img src="/banksetu-logo.png" alt="BANK SETU" /><div><span>Welcome back to</span><h2>BANK <strong>SETU</strong></h2></div></div>
          <p className="premium-login-subtitle">Login to manage your banking services<br className="premium-desktop-only" /> anytime, anywhere.</p>
          {pricingAvailable && <button type="button" className="premium-pricing-link" onClick={openPricing} disabled={pricingTransition}>View Pricing Plans <span>→</span></button>}

          <form onSubmit={onSubmit} noValidate>
            <label className="premium-field"><span>Email address</span><div className="premium-input-wrap"><span className="premium-input-icon" aria-hidden="true">✉</span><input type="email" placeholder="name@example.com" autoComplete="username" value={email} onChange={(event) => onEmailChange(event.target.value)} aria-label="Email address" /></div></label>
            <div className="premium-field"><div className="premium-field-heading"><span>Password</span><button type="button" className="premium-forgot" onClick={onForgotPassword} disabled={resetLoading}>{resetLoading ? "Sending…" : "Forgot password?"}</button></div><div className="premium-input-wrap"><span className="premium-input-icon" aria-hidden="true">▣</span><input type={showPassword ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} aria-label="Password" /><button type="button" className="premium-password-toggle" onClick={onTogglePassword} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div></div>
            {error && <div className="premium-message premium-error" role="alert"><span>!</span>{error}</div>}
            {successMessage && <div className="premium-message premium-success" role="status"><span>✓</span>{successMessage}</div>}
            <div className="premium-login-options"><label><input type="checkbox" /> <span>Keep me signed in</span></label><span className="premium-secure"><i /> Secure</span></div>
            <button className="premium-sign-in" type="submit" disabled={loading}><span>{loading ? "Signing in…" : "Sign In"}</span>{!loading && <span className="premium-sign-arrow">→</span>}</button>
          </form>
          <p className="premium-approval-note">New accounts are created by the Bank Setu administrator.</p>
          <footer className="premium-login-footer"><span><i /> Bank Setu Secure Access</span><b>•</b><span>v1.0</span><b>•</b><a href="/about">About</a><b>•</b><a href="/privacy-policy">Privacy Policy</a><b>•</b><a href="/terms">Terms</a></footer>
        </div>
      </section>

      {pricingTransition && <div className="premium-transition-overlay premium-pricing-transition" role="status" aria-live="polite"><div className="premium-transition-portal"><span className="premium-portal-ring premium-portal-ring-one" /><span className="premium-portal-ring premium-portal-ring-two" /><img src="/banksetu-logo.png" alt="Bank Setu" /></div><div className="premium-pricing-cards" aria-hidden="true"><span>Basic</span><span>Standard</span><span>Premium</span></div><p>Opening your current pricing plans…</p></div>}
    </main>
  );
}
