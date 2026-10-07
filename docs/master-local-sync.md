# Master local sync and monitoring activation

Client Admin connections are unchanged. The Master uses the existing configured Apps Script deployment, Sheet and photo folder.

## One-time Master Apps Script update

1. In Master Sync & Backup download BankSetu-Master-Code.gs. Back up the current Master script source and deployment version first.
2. Open the **existing Master Apps Script project**, replace Code.gs with the downloaded source. Keep all existing Script Properties. Do not run client setup or bind the Master to a client tenant.
3. Deploy → Manage deployments → edit the existing Web app → New version → Deploy. Preserve its existing execute-as and access settings and URL. No new Sheet/folder is required.
4. Sign out and sign back in online. Sync & Backup enables only when the deployed script advertises master-v1 and a connection ID derived from the existing Sheet/folder. Click Sync Now to download existing records.
5. Test a new customer: save locally, search locally, Sync Now, verify the same record in the original Sheet. An interrupted sync retains the queue; replay uses the same operation ID. Existing occupied columns Y:AA stop migration with an error instead of overwriting them.

Browser storage uses IndexedDB; Windows uses the existing encrypted SQLite adapter under Electron userData. Browser storage clearing can remove records; export backups. Close/hide sync is best effort; reopening resumes pending operations. Each device needs an initial online login and a signed offline grant, valid for eight hours. Shared frontend changes do not replace an already installed EXE or Android package.

## Monitoring permissions (one-time backend setup)

- Enable Cloud Monitoring API for banksetu-69e2f. Grant Monitoring Viewer to the existing Firebase service account used by the Worker. No additional private key is needed.
- Cloudflare: create a separate least-privilege **Account Analytics Read** token for the Bank Setu account. Save it only as Worker secret CLOUDFLARE_ANALYTICS_TOKEN. Set variable CLOUDFLARE_ACCOUNT_ID to c67c1c38d8481b01e9b9fbca5cb0f9b5. Do not use or expose a deployment token for this purpose.
- Refresh Master Settings. Missing permissions/data show Unavailable, never an invented zero. Metrics are cached five minutes. Hosting measurements may be delayed. Firestore daily reads/writes and Workers Free reference limits are estimates, not billing guarantees or a single Firebase request quota. Firestore resets on Pacific time; Workers on UTC.
- Client presence counts authenticated visible sessions that sent a heartbeat within seven minutes. It is recent activity, not an exact live socket count. Heartbeats are throttled to one successful write per user/device every five minutes; status queries are cached. Results above 1,000 recent documents are marked truncated.


## Release 1.0.25 — automatic initial download

A single workspace-aware scheduler starts on login and wakes when the connection becomes ready, the device reconnects, or the app regains focus. Paged downloads continue immediately in bounded batches until all customer rows are locally available. Each committed page retains its cursor for restart/reconnect. Server tombstones, rather than absence during a changing paginated scan, control deletion; pending local records are never replaced by cloud rows. Synchronization errors and last completed download are displayed in Sync & Backup.

Search returns local matches immediately. Linked customer photos are hydrated in small background batches through the existing authenticated, folder-scoped Apps Script endpoint, and retained for offline use. Original PDF links are synchronized, but the existing bridge does not expose original PDF file downloads; this release does not claim complete offline copies of all Drive files. The bridge must already support getCustomerPage with stable IDs; older deployments show an actionable error rather than silently pretending sync completed. Customer data stays in the existing SQLite/IndexedDB stores and in the correct user's tenant/connection scope.

Tests cover a fresh device receiving 1,251 rows, late workspace readiness, background photos, local search without network calls, interrupted pagination, pending local edits, and existing tenant isolation/queue protections. Firebase deployment identity is logged without private keys to diagnose the outstanding IAM denial.
