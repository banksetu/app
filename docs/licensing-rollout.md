# Licensing rollout checkpoint

This branch is an incomplete, feature-flagged implementation. Do not merge into the production branch or publish native builds until all items below are completed and verified.

## Current safety posture

- Existing tenants have no inferred expiry, payment, or automatic migration. Missing license metadata remains a legacy review state.
- `uiEnabled`, `newClientRequired`, `existingClientEnforcement`, and `verificationEnforcement` default to false. The settings screen only permits toggling `uiEnabled`, after Turnstile keys are configured.
- License records are separate Firestore collections. No customer, local database, sync, backup, or Apps Script source is changed.
- Native onboarding requires server-enabled UI and Cloudflare Turnstile. Public requests require Turnstile verification and atomic hashed IP/phone rate limits.
- This stage must not be promoted as strict license enforcement: existing Firebase/Apps Script customer operations are still governed by the existing account status and tenant checks.

## Prerequisites for a production release

1. Configure `LICENSE_TURNSTILE_SITE_KEY` as a Worker variable and `LICENSE_TURNSTILE_SECRET` as a Worker secret, using a Turnstile widget allowed on `banksetu-app.web.app`. Verify from both native WebViews; do not expose the secret in git.
2. Complete and independently verify offline license receipts with a pinned trusted verification key. The existing offline session's embedded public key must not be reused as a license trust anchor.
3. Define and test centralized enforcement at authenticated app and privileged backend boundaries, including direct Google bridge operations. Preserve existing tenant access during migration. Never gate database recovery or the pending sync queue.
4. Add a safe legacy tenant review tool and only activate `newClientRequired` or `existingClientEnforcement` after review. Missing license metadata must not be treated as expired.
5. Test account invitation email delivery and account recovery against Firebase test accounts. Test annual/lifetime activation, renewal and upgrade on both native platforms using synthetic tenants.
6. Add production-safe backend checks for approval/revocation and existing account action compatibility, and verify audit and request pagination.
7. Run complete native signed builds and tests, verify deployment and download manifests, then advance version from the latest published GitHub release.

## Rollback

The production branch checkpoint before this work is `39c3fa4dbbef34bc0512caa550b01f2e356da049` (v1.0.59 source tree). Do not reset local customer storage. To roll back an additive Worker deployment, redeploy the Worker from this source checkpoint; leave new Firestore license documents untouched for audit and recovery. Keep all enforcement flags off during initial rollout.

## Verification at this checkpoint (2026-10-10)

- `npm run test:worker`, `npm run test:local`, `npm run test:bridge`, `npm run test:portfolio`, `npm run check:schema`, and `npm run build` passed with synthetic data.
- Android `npx cap sync android` passed. Local `assembleDebug` could not complete because this environment has a Java runtime without `javac`; no signed Android APK was produced.
- Windows packaging reached NSIS but could not complete on this Linux host because Wine is absent. The existing Windows CI runner is required; no signed release or manifest was produced.
- No authenticated production licensing endpoint, Turnstile delivery, native sign-in flow, or real tenant migration has been verified. Production branch, Worker, Hosting, customer data, and v1.0.59 release have not been changed by this branch.
