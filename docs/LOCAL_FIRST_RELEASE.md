# Local-first testing build 1.0.5

Implementation branch: `codex/local-first-option-b`. Base working state: `f3bf8d7`, preserved on `backup/pre-local-first-f3bf8d7`. Existing frontend remains on its working branch; a separate Firebase `local-first-test` preview is built. Compatible backend additions deploy to the existing Worker, retaining legacy account/OAuth routes.

Implemented: shared customer data adapter, IndexedDB and encrypted SQLite transactions, partitioned record/outbox state, UUID identity, replay/idempotency, revision conflicts and admin review, bounded paged sync/cache, queued photos, client-owned PDF bridge, resource binding/owner checks, generated client setup download, signed eight-hour offline restart lease with online renewal, scoped backup export/restore, offline web shell, bounded logout attempt, desktop installer and updates with pre-install backup.

## Setup and packages

Read [Client Admin setup and acceptance tests](CLIENT_ADMIN_SETUP_HI.md). GitHub preview workflow uses existing Firebase/Cloudflare deployment secrets. The dedicated Google sync account must be configured separately as the Worker secret `GOOGLE_DRIVE_SERVICE_ACCOUNT`; optionally configure Actions secret `BANKSETU_GOOGLE_DRIVE_SERVICE_ACCOUNT` for its automated installation. No secret is included in the app/EXE. Drive/Sheets APIs must be enabled.

Validation workflow builds the unsigned Windows x64 NSIS installer after tests, browser login smoke and Windows Electron login/preload smoke. Signed installer workflow remains available with signing secrets. Unsigned testing builds use the fixed repository release and GitHub SHA-256 asset digest; signed builds retain electron-updater Authenticode verification. Publish a higher stable version installer in `banksetu/app` Releases to exercise updates. Successful branch builds attempt to publish the versioned unsigned testing installer in GitHub Releases. Version 1.0.5 was successfully published at https://github.com/banksetu/app/releases/tag/v1.0.5. Actions artifacts remain a fallback. If a future publication encounters a permission failure, configure BANKSETU_RELEASE_TOKEN with the required repository contents/workflow permissions or publish through the authorized repository UI. Versions are immutable; later changes require a version increment. Both paths back up before install and preserve userData.

## Validation and practical boundaries

Local checks: 26 meaningful automated tests, original 24-column schema verification and TypeScript/Vite build. GitHub CI additionally exercises browser/native app startup and creates the Windows installer. Actual account upload/search and device install/printing are acceptance tests for the user; no claim of live-account success is made before these run.

- Option B local-first activates for verified client workspaces. Master/OAuth workspaces retain their current behavior.
- Offline restart uses a previously authenticated persisted Firebase session, not offline password authentication. An eight-hour signed lease expires; disconnected devices cannot receive instant revocation. Public verification material is enrolled over the trusted authenticated Worker connection; local profile compromise is outside that permission boundary.
- Pulls are limited to four pages of 250 rows per run, 20-second pull budget, and 25 queued writes per run. Cache limits are 10,000 records/about 80 MB; pending records are not evicted. Local transactions reject above the 90 MB limit. Large workloads require real performance tests.
- Same verified Firebase/Google owner email is required. Shared Drives and separately owned resources fail closed. Each Gmail client must authorize/deploy their own bridge once. Organization policies may prohibit this deployment.
- Browser origin storage is not Windows encrypted storage and can be erased. Export before clearing data or replacing a connection. Backup restore is scoped to the same user/tenant/connection.
- Apps Script locks apply to one script project. Do not run multiple write bridges for one Sheet. Manual edits can still race a write; revision checks catch preexisting changes. Freeze old row-number writers before migrating.
- Photo upload can precede failed record sync; retries use deterministic operation identities. Orphan document cleanup is not automatic.
- Firestore stores configuration/resource binding, not the customer cloud database. Firebase Functions are not deployed. Google/Cloudflare quotas apply.

Commands: `npm run build`, `npm run check:schema`, `node --test cloudflare/worker.test.js scripts/workspace-regression.test.mjs scripts/local-first.test.mjs scripts/bridge.test.mjs scripts/offline-backup.test.mjs desktop/store.test.cjs desktop/testUpdater.test.cjs`.
