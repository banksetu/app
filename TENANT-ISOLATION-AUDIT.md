# Bank Setu tenant isolation audit

Audit date: 2026-10-01  
Repository: `banksetu/app`  
Audited commit: `5067f17712c05ed312653f7957b17ee529900e0b` (`main`, “Bank Setu V14 final UI and global theme update”)

## Repository facts

- GitHub currently has only the `main` branch. The handoff branch `client-system` and the described `backup-before-tenant-sheet` branch are not present.
- This commit does not contain tenant roles or tenant identity fields. Login and dashboard authorization understand only `admin` and `user`.
- Public self-registration was present in `src/App.tsx` and `src/Signup.tsx`. Firestore rules also allowed a signed-in user to create their own pending `user` profile.
- `apps-script/Code.gs` opens one fixed `SPREADSHEET_ID` for every authenticated account. The API checks Firebase identity and role, but does not resolve a tenant or tenant-specific spreadsheet.
- Google Sheet API URLs, bank information and logos use global local-storage keys. Dashboard settings are stored under `appSettings/{uid}`, so those cloud settings are per user, not shared by a client tenant.
- `firestore.rules` recognizes only the legacy `admin` role for administrative access. User approval/blocking is client-side Firestore mutation; `functions/src/index.ts` also has legacy admin-only callables. No `createClient` callable exists in this commit.
- `src/AdminUsers.tsx` calls a Cloudflare Worker for permanent user deletion, but the Worker source is not in this repository. Its authorization cannot be verified here.
- `firebase.json` targets Firebase project `banksetu-69e2f`. Frontend and Functions have build scripts; no test script is configured. No deployment was performed.

## Changes made on the review branch

- Removed the public signup route and button from the login flow.
- Denied direct client-side creation of user profile documents in Firestore rules. Provisioning must move to trusted server code before new accounts can be created through the application.

## Safe implementation order

1. Establish trusted account provisioning and a bootstrap path for the first `master_owner`.
2. Add immutable tenant identity to provisioned client admins and client users; make the client workspace configuration tenant-scoped.
3. Enforce tenant and role checks in Firestore rules, callable Functions, the Apps Script/API, and account-management operations. Query user records with tenant constraints.
4. Replace global local-storage fallbacks and the fixed spreadsheet selection with tenant-derived configuration. Resolve existing data ownership before migration; do not copy or delete production records automatically.
5. Add reliable actor, tenant, action, record, and timestamp audit events.
6. Inspect Passbook and Account Opening PDF output before implementing tenant/bank templates; retain current defaults as fallbacks.
7. Test in emulators or a non-production project, review the security rules and Functions, then ask for the needed Google/Firebase configuration and deployment actions.

## External architecture constraint

The checked-in Apps Script executes against one fixed spreadsheet. Tenant isolation cannot be completed by changing browser storage keys alone. A tenant-aware server-side sheet resolver and a trusted way to grant the execution identity access to each tenant's spreadsheet are required. Google OAuth client secrets must not be placed in frontend code. Google Cloud OAuth consent, scopes, and credential setup require owner-side configuration and should be decided after the connection architecture is verified.
