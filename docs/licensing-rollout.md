# Tenant license enforcement

All client administrators and client users require the tenant entitlement, regardless of the optional historical `licenseRequired` profile field. Only a verified master account is exempt. Missing licenses are Pending and read only.

The renderer uses `core/licenseAccess.ts` as its permission authority. The notice and Dashboard consume that state. Online protected actions fetch signed server authorization; same-day receipts never replace an online denial. Firestore license changes immediately lock the UI while the current signed revision is refreshed. Offline access is bounded by the signed receipt and paid/demo expiry. A device without a network cannot discover an unseen remote suspension until it reconnects; an observed denial invalidates its old offline receipt immediately.

Receipts verify the pinned RSA signature, user, tenant, status, plan, timestamps and authorization revision. Signed denial revisions prevent replay of an older active receipt. Windows stores this authorization separately from customer records, retains it across restarts and checks it for local commits, PDF creation and native print actions. Account switching locks the old native context. The five-day demo stays in its sample-only scope.

Pending, Expired, Suspended and Revoked paid accounts may view the Dashboard, read-only Customers and All Customer Data, limited account Settings, Backup/Export, Support and License Renewal. Protected document routes cannot mount while read only; customer mutations, PDF generation and printing also require the shared action guard. Worker writes are checked against the tenant license. Client Firestore business settings can only be changed through that Worker.

## Deployment order

1. Run critical Worker, local/UI/native, bridge, update and schema tests and the production build. Run the Firestore emulator isolation test.
2. Deploy the Worker and Firestore rules. Verify `/health` reports enforcement version 2 and the actual source commit.
3. Additively set `licenseRequired: true` on existing client profiles for compatibility with old packaged apps/bridges. The migration uses a conditional field-only update and never touches customer data, photos, tenant ownership or sync queues. Verify every configured tenant bridge advertises at least enforcement version 1 and its own tenant. An older/unverified bridge blocks release. Version 1 relies on the migrated protected profile field; new/updated bridges must deploy the bundled version 2 Code.gs, which ignores that flag entirely.
4. Require successful backend deployment before selecting the next unused release version. Pin the live public key and repeat critical tests before native builds and publication.
5. Build Windows and signed Android artifacts using the existing free-plan release pipeline; verify published assets and live Hosting metadata. Firebase Hosting currently serves the public portfolio; its release metadata must match the published native release. Do not replace that site with a different UI as part of a license fix.

Client-owned Apps Script projects are separate deployments. The release bundles updated Code.gs for their owners; GitHub deployment cannot silently publish code to a client's private Script project. Production compatibility checks and exact native/browser test results must be reported, without representing simulated tenant tests as real customer/device tests.

## Data retention

No reset, schema rewrite, customer migration or Sync Engine replacement is part of this fix. Customer records, photos, pending operations and backups remain in their existing scopes. The SQLite authorization table is additive. License renewal advances the server revision and restores permissions without replacing customer state.
