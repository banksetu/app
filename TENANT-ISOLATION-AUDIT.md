# Bank Setu tenant isolation and rollout notes

Audit date: 2026-10-01  
Repository: `banksetu/app`  
Base: `main` at `5067f17712c05ed312653f7957b17ee529900e0b`

## Implemented on this review branch

- Removed public signup from the login flow and denied client-side creation of user profile documents. Account creation now uses callable Functions.
- Added `master_owner`, `client_admin`, and `client_user` roles while retaining legacy `admin` and `user` behavior. New client workspaces are provisioned by `createClient`; each starts with two client-user seats. `createClientUser` reserves the remaining seat transactionally. Callable lifecycle operations enforce tenant scope and protect privileged accounts.
- Added tenant-specific Firestore settings, access rules, and a Master Owner screen to create clients and enter each tenant's Sheet ID, Drive folder ID, and Apps Script Web App URL. Client admins cannot change server-side connection IDs.
- Scoped browser API URL, bank identity/logo, and theme preferences by tenant (or legacy user). Operational customer screens now use the scoped API URL.
- Updated Apps Script to verify Firebase ID tokens, resolve the user's tenant from Firestore, and select that tenant's configured spreadsheet and photo folder. Tenant accounts fail closed when these IDs are missing. Legacy `admin`/`user` accounts without a tenant keep the existing shared Sheet and folder for compatibility.
- Replaced client-side account lifecycle writes and the unverified Cloudflare deletion call with callable Functions.
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
2. Bootstrap the first trusted owner by setting the intended Firebase Auth user's `users/{uid}` profile to `role: "master_owner"`, `status: "approved"`, and `active: true`. No owner UID was present in the repository, so none was guessed or seeded.
3. For every client, create a Google Sheet and Drive photo folder, share both with the Google account that owns the Apps Script deployment, deploy the tenant-aware Apps Script, then enter those IDs and its `/exec` URL in Master Clients.
4. Deploy the Apps Script version after reviewing its Google scopes and execution identity. Test that two tenants cannot read or write each other's Sheet or photos.
5. Existing production records remain in the old shared spreadsheet. Assign ownership and migrate records deliberately before moving legacy users or removing the old spreadsheet/folder. No data migration or production deployment was performed.
6. Verify customer CRUD, photos, audit entries, user seat limits, approval/blocking, passbook print, and PDF output in a non-production project.

## Known limits

- This repository does not include the Cloudflare Worker source, so the former deletion implementation could not be audited; the UI no longer calls it.
- The current Sheet/Drive connection uses the Apps Script deployment identity and manual sharing. It does not implement per-tenant Google OAuth consent or token storage.
- `BankSetuAudit` is an append-only application log, not a tamper-proof compliance ledger. Existing customer records and historical activity are not backfilled.
- Passbook and Account Opening PDF remain on their existing layouts. Per-bank templates need reviewed samples and explicit field/layout requirements.
