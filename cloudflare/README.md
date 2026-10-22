# Bank Setu Cloudflare account service

This Worker replaces Spark-blocked Firebase callable functions for account
approval, denial, block, unblock and deletion. It verifies the caller's Firebase
ID token, reloads the active Firestore profile, checks the role and tenant, then
uses a server-only service account to update Firebase Authentication and
Firestore. Never put the service-account JSON in this repository or in a
`VITE_*` variable.

## Cloudflare configuration

In the `banksetu-client-api` Worker, set the secret `FIREBASE_SERVICE_ACCOUNT`
to the full Firebase service-account JSON. It needs permission to manage Firebase
Authentication users and Firestore documents in project `banksetu-69e2f`.

Set Worker variables from `wrangler.toml`:

- `FIREBASE_PROJECT_ID`: `banksetu-69e2f`
- `FIREBASE_WEB_API_KEY`: the Firebase Web API key already used by the app (Worker variable)
- `ALLOWED_ORIGINS`: the production Hosting origin(s), comma separated

Deploy this Worker from the repository root with:

```sh
npx wrangler deploy --config cloudflare/wrangler.toml
```

Use the resulting `workers.dev` URL as `VITE_BANKSETU_WORKER_URL` when building
the Hosting site. Do not include a trailing slash. Rebuild and deploy Hosting
after setting it so the account controls can reach the Worker.

The `DELETE` endpoint permanently removes ordinary client-user/legacy-user Auth
accounts and their user profile. Deleting a Client Admin is deliberately refused
until tenant offboarding is implemented; it must also revoke the tenant's other
accounts without deleting the client's Google Drive data.

## Endpoints

- `GET /health` reports that the Worker is running.
- `POST /account-action` with `{ "uid": "...", "action": "approve|deny|block|unblock" }`
- `POST /delete-user` with `{ "uid": "..." }` (Master Admin only)
- `POST /create-client-user` with `{ "name": "...", "email": "...", "password": "..." }` (Client Admin only)
- `POST /create-client`, `/get-google-setup`, `/save-google-setup`, `/save-client-registration`, `/configure-tenant-data`, `/save-bank-format-template`, and `/save-bank-format-mapping`

Run the local Worker request checks with `npm run test:worker`.

Both endpoints require `Authorization: Bearer <Firebase ID token>` and only accept
origins listed in `ALLOWED_ORIGINS`.
