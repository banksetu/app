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
