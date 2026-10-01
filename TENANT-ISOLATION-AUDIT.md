# Bank Setu tenant isolation and rollout notes

Audit date: 2026-10-01  
Repository: `banksetu/app`  
Base: `main` at `5067f17712c05ed312653f7957b17ee529900e0b`

## Implemented on this review branch

- Removed public signup from the login flow and denied client-side creation of user profile documents. Account creation now uses callable Functions.
- Added `master_owner`, `client_admin`, and `client_user` roles while retaining legacy `admin` and `user` behavior. New client workspaces are provisioned by `createClient`; each starts with two client-user seats. `createClientUser` reserves the remaining seat transactionally. Callable lifecycle operations enforce tenant scope and protect privileged accounts.
- Added one-time first-owner bootstrap for the verified `banksetu2026@gmail.com` account, so the owner profile does not need a manually looked-up Firebase UID. It refuses to run if a Master Owner already exists.
- Added tenant-specific Firestore settings, access rules, and a Master Owner screen to create clients. The Master Owner saves Bank Setu's OAuth client ID, shared Apps Script URL, and Apps Script deployment account once; Client Admins first complete a short bank/branch registration form, then connect their own Google account through a one-click first-login wizard.
- The Google setup wizard creates the workspace files in the Client Admin's Google Drive, grants the Apps Script deployment account access only to that workspace folder, and submits the short-lived Google access token to a callable Function for ownership and permission verification. The Function creates the same 24 ordered customer column headers as the reference Apps Script schema in the new blank client Sheet; it never copies rows or data from the Master Sheet. The token is not stored. The Function saves the verified file IDs under that tenant.
- Added three bank sample slots: Passbook, Quick Passbook, and Account Opening PDF. Client Admins upload PDF/image samples directly into their own tenant Drive folder; Functions verify owner, type, folder, and size before recording metadata. Authorized tenant users can preview samples through the tenant-aware Apps Script endpoint.
- Added a Client Admin field mapper for text and customer photo placement across up to 10 PDF pages, paper size, alignment, and font size. Saved mappings are verified by a callable Function and used in the Passbook, Quick Passbook, and Account Opening print flows over the uploaded sample.
- Master Admin dashboard color and menu choices are stored once in shared UI settings and delivered to every signed-in tenant in real time. Client Admins cannot override those global appearance settings.
- Master User Management groups client users under their Client Admin/workspace and displays the two-user count. Search supports client/admin/user names, email, role, and tenant ID.
- Added a read-only workspace health check that confirms Apps Script can open the tenant's spreadsheet, customer tab, and Drive folder without changing customer data.
- Scoped browser API URL, bank identity/logo, and theme preferences by tenant (or legacy user). Operational customer screens now use the scoped API URL.
- Updated Apps Script to verify Firebase ID tokens, resolve the user's tenant from Firestore, and select that tenant's configured spreadsheet and photo folder. Tenant accounts fail closed when these IDs are missing. Legacy `admin`/`user` accounts without a tenant keep the existing shared Sheet and folder for compatibility.
- Replaced client-side account lifecycle writes and the unverified Cloudflare deletion call with callable Functions.
- Added Master Owner client offboarding: it disables and removes the Client Admin and tenant users while marking the tenant offboarded. The tenant's Sheet, Drive folder, and settings are preserved. The UI confirms that business data is not deleted.
- Added a `BankSetuAudit` tab per spreadsheet for customer create/update/delete and passbook delivery/print activity. Reports reads recent events from the authenticated tenant's spreadsheet and displays the actor and email.
- Kept the original fixed Passbook and Account Opening layouts as a fallback for tenants without a mapped sample. Per-bank mapped output needs print calibration with the actual bank sample and printer before rollout.

## Verification performed

- `npm run lint`: passed with one React hook dependency warning in `src/App.tsx`.
- `npm run build`: passed.
- `npm --prefix functions run build`: passed.
- `node --check < apps-script/Code.gs`: passed.
- Firebase Rules emulator verification was not run: the available Java runtime is 17, while the initially invoked Firebase CLI version requires Java 21. Deploy rules/functions only after testing with a compatible emulator or a non-production Firebase project.

## Required setup before production use

1. Review this PR and deploy Firestore rules and Functions to the intended Firebase project.
2. Sign in once with the verified `banksetu2026@gmail.com` account after deploying Functions; the first login creates the Master Owner profile automatically if no Master Owner exists.
3. Deploy the tenant-aware Apps Script once and save its shared `/exec` URL plus deployment-owner Google email in Master Clients. Configure the OAuth Web Client ID and allowed JavaScript origin in Google Cloud; enable the Drive and Sheets APIs.
4. After deployment, run first login with a non-production Client Admin and verify the Sheet and folder are owned by that Google account, the Apps Script owner sees only that workspace folder, and two tenants cannot read or write each other's files. Use the in-app workspace health check.
5. Existing production records remain in the old shared spreadsheet. Assign ownership and migrate records deliberately before moving legacy users or removing the old spreadsheet/folder. No data migration or production deployment was performed.
6. Verify customer CRUD, photos, audit entries, user seat limits, approval/blocking, passbook print, and PDF output in a non-production project.

## Known limits

- This repository does not include the Cloudflare Worker source, so the former deletion implementation could not be audited; the UI no longer calls it.
- Apps Script continues to run under its deployment account for data operations. The Client Admin owns the files and explicitly shares only the workspace folder with that account; direct per-user OAuth is used only during setup, and no refresh token is stored.
- Google Cloud OAuth client creation, API enablement, authorized-origin setup, Apps Script deployment, owner bootstrap, live OAuth consent, and production rollout require the actual project/account and were not performed from this repository. The current workspace has no Firebase CLI, gcloud, or clasp session, and its Cloud Console browser tab is unavailable.
- Bank sample upload, preview, field mapping, and mapped printing are implemented for customer fields and photo. PDF samples support up to 10 pages; passbook transaction-row placement still needs implementation and sample review. Tenants without a saved mapping use the prior fixed output.
- The global dashboard controller currently propagates dashboard and menu appearance settings; other master-controlled dashboard options can be added as requirements are finalized.
- `BankSetuAudit` is an append-only application log, not a tamper-proof compliance ledger. Existing customer records and historical activity are not backfilled.
