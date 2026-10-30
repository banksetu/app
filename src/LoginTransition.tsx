import "./LoginExperience.css";
import "./LoginTransition.css";

export default function LoginTransition() {
  return (
    <main className="premium-transition-overlay premium-login-transition" role="status" aria-live="polite">
      <div className="premium-transition-portal">
        <span className="premium-portal-ring premium-portal-ring-one" />
        <span className="premium-portal-ring premium-portal-ring-two" />
        <span className="premium-portal-ring premium-portal-ring-three" />
        <img src="/banksetu-logo.png" alt="Bank Setu" />
      </div>
      <div className="premium-transition-copy">
        <strong>BANK SETU</strong>
        <span>Verifying your account and license securely…</span>
        <div className="premium-progress-track"><i /></div>
        <small>Authentication and licensing checks continue without artificial delay.</small>
      </div>
    </main>
  );
}
