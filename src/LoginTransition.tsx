import "./LoginExperience.css";
import "./LoginTransition.css";

/**
 * One shared authenticated loading presentation for the first app bootstrap,
 * restored sessions, lazy app routes and manual sign-in. Visual transitions
 * never impose a minimum wait or modify authorization / recovery behavior.
 */
export default function LoginTransition({phase="login"}:{phase?:"login"|"startup"}) {
  const message=phase==="startup"
    ?"Preparing your secure Bank Setu workspace…"
    :"Verifying your account and license securely…";
  return (
    <main className="premium-transition-overlay premium-login-transition"
      role="status" aria-live="polite" aria-label="Bank Setu secure loading">
      <div className="premium-transition-portal" aria-hidden="true">
        <span className="premium-portal-ring premium-portal-ring-one" />
        <span className="premium-portal-ring premium-portal-ring-two" />
        <span className="premium-portal-ring premium-portal-ring-three" />
        <img src="/banksetu-logo.png" alt="" width="152" height="152"
          decoding="async" />
      </div>
      <div className="premium-transition-copy">
        <strong>BANK SETU</strong>
        <span>{message}</span>
        <div className="premium-progress-track" aria-hidden="true"><i /></div>
        <small>Authentication, licensing and offline recovery continue securely without artificial delay.</small>
      </div>
    </main>
  );
}
