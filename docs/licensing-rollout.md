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

1. Configure `LICENSE_TURNSTILE_SITE_KEY` as a Worker variable and `LICENSE_TURNSTILE_SECRET` as a Worker secret, using a Turnstile widget allowed on `banksetu-app.web.app`. Verify from both native WebViews; do not expose the secret in git.
2. Verify the deployed Worker public key against the pinned build key during the release. A service-account key rotation requires a new app build; retain the old key as an accepted verifier during any rotation window.
3. Deploy the additive Firestore rule before the Worker; verify a synthetic tenant can read only its own license. Update the per-tenant Apps Script deployment with the bundled Code.gs before enabling newly licensed clients.
4. Verify the reported absence of existing clients before enabling existing-client enforcement. New-client invitation is the default path; a prior app's legacy create-client request receives a clear redirect error. Missing metadata is never interpreted as expiry for legacy accounts.
5. Test Turnstile request delivery, invitation email, account recovery, annual/lifetime, renewal, suspension/revocation, and upgrade on real Windows and Android test devices using synthetic tenants. Windows opens the public HTTPS request form because Turnstile cannot run at its custom app protocol origin.
6. Run complete native builds and tests, verify deployment and download manifests, then advance from the latest published GitHub release.

## Rollback

The production branch checkpoint before this work is `39c3fa4dbbef34bc0512caa550b01f2e356da049` (v1.0.59 source tree). Do not reset local customer storage. To roll back an additive Worker deployment, redeploy the Worker from this source checkpoint; leave new Firestore license documents untouched for audit and recovery. Keep all enforcement flags off during initial rollout.

## Verification at this checkpoint (2026-10-10)

- `npm run test:worker` (including synthetic activation, renewal, upgrade, duplicate approval and unauthorized access), `npm run test:local`, `npm run test:bridge`, `npm run test:portfolio`, `npm run check:schema`, `npm run build`, and `npm run build:portfolio` passed with synthetic data at this checkpoint. Re-run after the final changes.
- Android `npx cap sync android` passed. Local `assembleDebug` could not complete because this environment has a Java runtime without `javac`; no signed Android APK was produced.
- Windows packaging reached NSIS but could not complete on this Linux host because Wine is absent. The existing Windows CI runner is required; no signed release or manifest was produced.
- No authenticated production licensing endpoint, Turnstile delivery, native sign-in flow, or real tenant migration has been verified. Production branch, Worker, Hosting, customer data, and v1.0.59 release have not been changed by this branch.
