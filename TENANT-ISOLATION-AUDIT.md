# Bank Setu tenant isolation and rollout notes

Audit date: 2026-10-01  
Repository: `banksetu/app`  
Base: `main` at `5067f17712c05ed312653f7957b17ee529900e0b`

## Implemented on this review branch

- Removed public signup from the login flow and denied client-side creation of user profile documents. Account creation now uses callable Functions.
- Added `master_owner`, `client_admin`, and `client_user` roles while retaining legacy `admin` and `user` behavior. New client workspaces are provisioned by `createClient`; each starts with two client-user seats. `createClientUser` reserves the remaining seat transactionally. Callable lifecycle operations enforce tenant scope and protect privileged accounts.
- Added tenant-specific Firestore settings, access rules, and a Master Owner screen to create clients. The Master Owner saves Bank Setu's OAuth client ID, shared Apps Script URL, and Apps Script deployment account once; Client Admins then create their own Sheet and Drive folder through a first-login wizard.
- The Google setup wizard creates the workspace files in the Client Admin's Google Drive, grants the Apps Script deployment account access only to that workspace folder, and submits the short-lived Google access token to a callable Function for ownership and permission verification. The token is not stored. The Function saves the verified file IDs under that tenant.
- Scoped browser API URL, bank identity/logo, and theme preferences by tenant (or legacy user). Operational customer screens now use the scoped API URL.
- Updated Apps Script to verify Firebase ID tokens, resolve the user's tenant from Firestore, and select that tenant's configured spreadsheet and photo folder. Tenant accounts fail closed when these IDs are missing. Legacy `admin`/`user` accounts without a tenant keep the existing shared Sheet and folder for compatibility.
- Replaced client-side account lifecycle writes and the unverified Cloudflare deletion call with callable Functions.
- Added Master Owner client offboarding: it disables and removes the Client Admin and tenant users while marking the tenant offboarded. The tenant's Sheet, Drive folder, and settings are preserved. The UI confirms that business data is not deleted.
- Added client workspace identity to the management list and retained search by client name, email, role, and tenant ID.
- Added a `BankSetuAudit` tab per spreadsheet for customer create/update/delete and passbook delivery/print activity. Reports reads recent events from the authenticated tenant's spreadsheet and displays the actor and email.
- Kept current Passbook and Account Opening PDF layouts intact. They still have bank-specific/fixed layout assumptions; a configurable template editor was not introduced because there is no reviewed per-bank sample set or template contract in the repository. These output layouts need per-bank review before rollout.

## Verification performed

- `npm run lint`: passed with two existing React hook dependency warnings (`src/App.tsx`, `src/Dashboard.tsx`).
- `npm run build`: passed.
- `npm --prefix functions run build`: passed.
- `node --check < apps-script/Code.gs`: passed.
- Firebase Rules emulator verification was not run: the available Java runtime is 17, while the initially invoked Firebase CLI version requires Java 21. Deploy rules/functions only after testing with a compatible emulator or a non-production Firebase project.

## Required setup before production use

1. Review this PR and deploy Firestore rules and Functions to the intended Firebase project.
2. Bootstrap the first trusted owner by setting the intended Firebase Auth user's `users/{uid}` profile to `role: "master_owner"`, `status: "approved"`, and `subscriptionStatus: "active"`. No owner UID was present in the repository, so none was guessed or seeded.
3. Deploy the tenant-aware Apps Script once and save its shared `/exec` URL plus deployment-owner Google email in Master Clients. Configure the OAuth Web Client ID and allowed JavaScript origin in Google Cloud; enable the Drive and Sheets APIs.
4. After deployment, run first login with a non-production Client Admin and verify the Sheet and folder are owned by that Google account, the Apps Script owner sees only that workspace folder, and two tenants cannot read or write each other's files.
5. Existing production records remain in the old shared spreadsheet. Assign ownership and migrate records deliberately before moving legacy users or removing the old spreadsheet/folder. No data migration or production deployment was performed.
6. Verify customer CRUD, photos, audit entries, user seat limits, approval/blocking, passbook print, and PDF output in a non-production project.

## Known limits

- This repository does not include the Cloudflare Worker source, so the former deletion implementation could not be audited; the UI no longer calls it.
- Apps Script continues to run under its deployment account for data operations. The Client Admin owns the files and explicitly shares only the workspace folder with that account; direct per-user OAuth is used only during setup, and no refresh token is stored.
- Google Cloud OAuth client creation, API enablement, authorized-origin setup, Apps Script deployment, owner bootstrap, live OAuth consent, and production rollout require the actual project/account and were not performed from this repository.
- Bank sample upload/preview templates and master-controlled global dashboard settings are still not implemented.
- `BankSetuAudit` is an append-only application log, not a tamper-proof compliance ledger. Existing customer records and historical activity are not backfilled.
- Passbook and Account Opening PDF remain on their existing layouts. Per-bank templates need reviewed samples and explicit field/layout requirements.
