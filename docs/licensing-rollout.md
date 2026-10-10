# Licensing rollout checkpoint

This branch is a feature-flagged implementation checkpoint. Do not merge into the production branch or publish native builds until the external prerequisites and native verification below are complete.

## Current safety posture

- Existing tenants have no inferred expiry, payment, or automatic migration. Missing license metadata remains a legacy review state.
- `newClientRequired` defaults to true: fresh tenants must use the secure invitation and paid assignment path. `uiEnabled`, `existingClientEnforcement`, and `verificationEnforcement` default to false. Public onboarding is enabled only after Turnstile keys are configured.
- License records are separate Firestore collections. Local customer storage, sync queues and backup formats are unchanged. The Apps Script bridge now checks the tenant license on direct customer writes for explicitly licensed users; client deployments must use the updated downloadable Code.gs.
- Native onboarding requires server-enabled UI and Cloudflare Turnstile. Public requests require Turnstile verification and atomic hashed IP/phone rate limits.
- New invited users have an explicit `licenseRequired` marker; their Worker and Apps Script writes are checked against the tenant license. Existing unmarked users retain access. The legacy `/create-client` path is disabled when `newClientRequired` is enabled.
- A pinned public key is generated from the live Worker during the app release workflow. Until that occurs, the placeholder key intentionally prevents new licensed app sessions from being treated as verified.

## Prerequisites for a production release

1. Create a Turnstile widget restricted to `banksetu-app.web.app`. Add `LICENSE_TURNSTILE_SITE_KEY` and `LICENSE_TURNSTILE_SECRET` to GitHub Actions Secrets; the Worker deploy workflow installs them as Worker secrets using the existing scoped Cloudflare API token. Verify the public HTTPS request form and Android WebView. Do not expose the secret in git or chat.
2. Verify the deployed Worker public key against the pinned build key during the release. A service-account key rotation requires a new app build; retain the old key as an accepted verifier during any rotation window.
3. Deploy the additive Firestore rule before the Worker; verify a synthetic tenant can read only its own license. Update the per-tenant Apps Script deployment with the bundled Code.gs before enabling newly licensed clients.
4. Verify the reported absence of existing clients before enabling existing-client enforcement. New-client invitation is the default path; a prior app's legacy create-client request receives a clear redirect error. Missing metadata is never interpreted as expiry for legacy accounts.
5. Test Turnstile request delivery, invitation email, account recovery, annual/lifetime, renewal, suspension/revocation, and upgrade on real Windows and Android test devices using synthetic tenants. Windows opens the public HTTPS request form because Turnstile cannot run at its custom app protocol origin.
6. Run complete native builds and tests, verify deployment and download manifests, then advance from the latest published GitHub release.

## Rollback

The current production branch checkpoint is `6a0607584a69030a5ecfee38dc3a51e2e8e9619a` (published v1.0.61). Do not reset local customer storage. Before any additive Worker deployment, record its actual deployed version; rollback must restore that deployed Worker, not an older historical commit. Leave new Firestore license documents untouched for audit and recovery. Keep all enforcement flags off during initial rollout.

## Verification at this checkpoint (2026-10-10)

- `npm run test:worker` (including synthetic activation, renewal, upgrade, duplicate approval and unauthorized access), `npm run test:local`, `npm run test:bridge`, `npm run test:portfolio`, `npm run check:schema`, `npm run build`, and `npm run build:portfolio` passed with synthetic data at this checkpoint. Re-run after the final changes.
- Android `npx cap sync android` passed. Local `assembleDebug` could not complete because this environment has a Java runtime without `javac`; no signed Android APK was produced.
- Windows packaging reached NSIS but could not complete on this Linux host because Wine is absent. The existing Windows CI runner is required; no signed release or manifest was produced.
- The final-upgrade staging branch adds read-only UI guards, demo separation, client identity/history, PDF selection and bounded recovery checks. At its latest checkpoint, `npm run test:local` (14 test files), `npm run test:worker` (4 test files), `npm run test:bridge`, `npm run test:updates`, `npm run check:schema`, targeted ESLint and `npm run build` passed. Repository-wide `npm run lint` still fails (23 errors across business modules); resolve or establish a reviewed baseline before release.
- Native Electron `local:commit` IPC currently checks scope and transaction shape but has no independent license authorization. Do not claim an IPC-enforced read-only license until this is addressed without locking out legitimate legacy clients or blocking backup/recovery metadata. Per-tenant deployed Apps Scripts may also lag behind the updated source and must be verified separately.
- No authenticated production licensing endpoint, Turnstile delivery, native sign-in flow, real-device PDF/print flow, customer count or actual tenant migration has been verified. Production branch, Worker, Hosting, customer data and the v1.0.61 release have not been changed by this staging branch. Do not promote it or advertise v1.0.62 until native signing, server-side enforcement and live metadata are verified.
