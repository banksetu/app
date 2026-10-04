# Local-first implementation and release status

Base: `f3bf8d7`, `codex/spark-client-workspace-20261001`. Implementation is isolated on `codex/local-first-option-b`; production auto-deploy workflows do not run on this branch. The backup branch preserves the base commit. Existing OAuth/Master connections keep their current path; local-first behavior activates only for verified Option B connections.

Implemented: shared data request adapter, transactional IndexedDB record/outbox state, user/tenant/connection partitioning, stable record IDs, operation replay, revision conflicts, explicit administrator review, controlled pull, local photo/PDF queue, client-owned document bridge, resource owner checks and atomic resource reservations, encrypted SQLite desktop store, limited Electron preload, offline shell caching, bounded logout flush, update backup and signed-updater gate.

## Deployment prerequisites

- Existing Worker Firebase admin credential remains separate. Add `GOOGLE_DRIVE_SERVICE_ACCOUNT` through Cloudflare secret settings using the dedicated sync account JSON. Never commit the JSON or embed it in the installer. Enable Google Drive and Sheets APIs for that service account project.
- Deploy the Worker and Hosting after reviewing this branch. Existing production workflows target `codex/spark-client-workspace-20261001`; merging changes there triggers live deployments. Apps Script is a separate deployment.
- Each Gmail client must authorize/deploy the client-owned Apps Script bridge; see `CLIENT_ADMIN_SETUP_HI.md`. Its authenticated API rechecks Firebase approval, subscription, tenant status and ownership. The new flow currently requires the client's verified Firebase email to match Google resource ownership. Shared Drives and a different resource-owner email fail closed until separate ownership proof is implemented.
- No customer records are put in Firestore. `googleResourceBindings` contains resource/tenant mapping only and is accessible through privileged Worker credentials; existing rules deny browser access by default.
- Google and Cloudflare quotas still apply; Firebase Functions are not deployed and Blaze is not required by this architecture.

## Windows

The validation workflow produces an **unsigned test installer**, not a production signed release. The signing workflow requires repository secrets `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`, `WINDOWS_PUBLISHER_NAME`. It produces artifacts without publishing. A reviewed signed release must include the installer, blockmap and `latest.yml` at the configured `banksetu/app` GitHub release feed. Package version must be incremented via the existing release script before release.

Electron uses a packaged build, sandbox/context isolation, denied navigation/permissions and an allowlisted external-link handler. SQLite lives under Electron userData/database. Windows safeStorage encrypts payloads before SQLite writes; startup fails if OS encryption is unavailable. Compare-and-swap transactions reject stale desktop writes. Before update installation the encrypted database is checkpointed and copied; uninstall preserves app data. Release/update behavior still needs real Windows verification and signing credentials.

## Limits requiring acceptance

- Offline operations currently require an already verified signed-in session. Fresh login/restart while offline has not been implemented as a persistent signed permission lease. The eight-hour offline limit is a local usability control; it cannot promise instant revocation on a disconnected device.
- Local-first is enabled for Option B client connections only. Existing Master/OAuth workspaces are preserved rather than automatically migrated.
- Full pull currently reads all customers; pagination and bounded large-workspace cache have not been implemented. Large client datasets need performance testing.
- Browser records are origin-scoped IndexedDB without Windows at-rest encryption; site-data deletion can lose pending edits. JSON export exists; restore/import is not yet implemented.
- Conflict replay and row mutation are protected under one Apps Script project's lock. Do not run multiple independent write bridges against one Sheet. Manual spreadsheet edits and other script projects cannot share that lock; revision checks detect preexisting changes, but a concurrent manual edit during a write remains a race.
- Legacy routes retain compatibility. Option B UI writes use the sync protocol; stable identity cannot protect old clients calling legacy row-number mutation APIs. Freeze legacy writers before migrating a Sheet.
- Client-owned photo/PDF uploads, Google permissions, quotas, Apps Script CORS/authorization, Windows rendering/printing and signed updater recovery need live-account/device acceptance tests. Unit tests are not proof those deployments work.
- Photo upload can succeed before a record write fails. Retry is confined to the same client folder; PDFs use operation-derived names to avoid duplicate uploads. Orphan document cleanup is not automated.

## Validation

Run `npm run build`, `npm run check:schema`, and `node --test cloudflare/worker.test.js scripts/workspace-regression.test.mjs scripts/local-first.test.mjs scripts/bridge.test.mjs desktop/store.test.cjs`. CI repeats these and builds the Windows test package. Do not publish a manifest claiming a working desktop updater before the signed installer and its acceptance tests pass.

Local verification completed: TypeScript/Vite production build, original 24-column schema check, focused lint for new local/connection components, and 21 automated tests passed. A browser visual smoke test was attempted, but Chromium download was blocked/corrupted in this environment; no visual QA or live-account test is claimed.
