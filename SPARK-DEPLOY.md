# BankSetu Spark plan handoff

This package is based on the uploaded repository snapshot. Back up your current `/workspaces/app` first. Preserve newer edits made after this snapshot: compare before replacing.

## What changed
- Admin user management is in Settings, backed by Firestore reads/updates instead of unavailable Cloud Functions.
- Approve, deny, block and unblock update `users/{uid}`. Approval sets `subscriptionStatus: active`; blocked/denied sets inactive. The existing app and Apps Script check these fields.
- Admin-only Settings and dashboard color controls are hidden for normal users. Password change, System Status and Logout remain available.
- Registration uses a temporary Firebase app so creating a new account does not replace the current admin login.
- Fixed the frontend TypeScript errors for Passbook.
- Added `firestore.rules` and wired it into `firebase.json`; the unavailable Functions deployment target was removed. Functions source remains for reference but is not deployed.

## Before deployment
1. Confirm the current Firebase Console Firestore rules. The uploaded ZIP had no rules file. If Console rules include other collections or special access, merge those rules into `firestore.rules` rather than overwriting them. This package uses only `users` and `appSettings` in its frontend.
2. The admin's `users/{adminUid}` document must have `role: admin`, `status: approved`, `subscriptionStatus: active`. Do not change the admin UID or email. A Firebase Console administrator can inspect this document.
3. Run `npm install` then `npm run build` in `/workspaces/app`. Build was successful in the analysis workspace.
4. Deploy Firestore rules first: `firebase deploy --only firestore:rules` from `/workspaces/app`. Test an existing admin login and user list.
5. Deploy the frontend: `firebase deploy --only hosting:banksetu-app`. This should publish to the configured Hosting site under project `banksetu-69e2f`. Confirm the actual URL shown by Firebase CLI. Firebase project ID is separate from the Hosting URL.
6. Test a new registration, pending login rejection, approval, approved login, block, unblock and deny. Use a test account, not a real customer account. Confirm the existing customer workflows.

## Limits and security
- `Delete` is intentionally absent from the browser UI. Removing another person's Firebase Authentication account requires a trusted Admin SDK backend. On Spark, use Firebase Console Authentication > Users to manually remove that account; then remove its Firestore user document in Console. Do not delete the Firestore document alone and assume Auth was removed.
- Firestore rules prevent a user from approving or elevating themselves, and restrict the user list to a verified active admin profile. Test actual deployed rules before relying on this for customer data.
- This change does not rewrite the existing Apps Script deployment or audit its deployed version. Repo Apps Script checks Firebase ID tokens and profile status; verify the live Apps Script version matches the repo.
- Existing Settings appSettings data, customer Sheet/Drive data, and Auth users are not migrated or deleted.
