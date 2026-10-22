# Bank Setu deployment notes (Firebase Spark)

Firebase Spark remains the plan. Firebase Authentication, Firestore, and Hosting
stay on Firebase; operations that need a trusted server now run in the
`banksetu-client-api` Cloudflare Worker. The app must be built with
`VITE_BANKSETU_WORKER_URL` set to that Worker URL.

## Cloudflare Worker

Follow [cloudflare/README.md](cloudflare/README.md). The Worker requires the
`FIREBASE_SERVICE_ACCOUNT` secret and the `FIREBASE_WEB_API_KEY` variable, plus
the project ID and allowed app origins in `cloudflare/wrangler.toml`. Preserve
the already uploaded service-account secret; never put it in this repository.
Once the Worker is deployed, build with its `workers.dev` URL:

```sh
VITE_BANKSETU_WORKER_URL=https://YOUR-WORKER-URL npm run build
```

## Tenant data protection

Client Admin and Client User profiles must include their own `tenantId`. A
legacy `user` with no tenant is refused by the app and Apps Script; the Apps
Script no longer falls back to the Master spreadsheet for that account. Apps
Script source uses these deployment-only Script Properties for the legacy
Master workspace: `BANKSETU_LEGACY_SPREADSHEET_ID`,
`BANKSETU_LEGACY_PHOTO_FOLDER_ID`, and `BANKSETU_FIREBASE_API_KEY`. Preserve
their existing values when updating the deployment.

Deploy the Apps Script source as a new version of the existing Web App, keep its
existing deployment URL, and set access to the intended Google accounts. The
source change is not live until a new Apps Script version is deployed.

## Release order

1. Deploy the Worker and confirm its `/health` route if one is configured, or
   verify that OPTIONS and an unauthenticated POST return the expected response.
2. Build with `VITE_BANKSETU_WORKER_URL` and deploy Hosting to the existing
   `banksetu-app` site.
3. Deploy `firestore.rules` only if the current project does not already have
   the reviewed tenant rules. These rules were previously deployed to
   `banksetu-69e2f`.
4. Deploy the fail-closed Apps Script update while preserving Script Properties.
5. Test with a disposable client workspace and test users before entering real
   customer data: separate Master and Client accounts, search, create, update,
   bank format setup, block/unblock, and deletion.

## Current Worker limits

- Master Admin can create Client Admin accounts and manage regular users.
- Client Admin can create at most two Client Users and manage their access.
- Master deletion currently supports ordinary users. Deleting a Client Admin
  is refused until a tenant offboarding operation can revoke that tenant's
  other accounts while retaining its Google Drive data.
- Customer entry, search, and update continue through the existing Apps Script
  tenant-bound API. The app's Worker and Apps Script code still need deployment
  before these source changes take effect in production.
