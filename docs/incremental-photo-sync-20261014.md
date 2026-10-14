# Incremental photo sync — 14 October 2026

Base production: 814dc334f8499472f51c56c1edfbcd428f145099 (1.0.77).

The old existence inventory rescanned the Drive folder hourly and treated unknown legacy customers as photo candidates. Sync now uses a resumable Drive v3 metadata baseline, then persisted Changes API tokens. A hidden, connection-bound BANKSETU_PHOTO_INDEX tab holds metadata only. No customer rows or Drive images are removed during indexing. Token expiration restarts a safe baseline without asserting absence prematurely. Photo index generations prevent stale device checkpoints from skipping rebuilt indexes.

Local index/checkpoints live in the existing tenant-scoped repository. Known absent photos have zero pending operations. Only changed versions invalidate cached previews. A bounded, one-time SHA256 baseline verifies legacy cached images when Drive provides checksums. Hashing and uploads are tied to real changes. Queued text edits omit photo bytes and old URLs so a newer replacement cannot be reverted. Previous Drive files are retained. Photo discovery/transfer errors have bounded retries and do not stop customer-data sync.

Customer snapshot digests include all existing row fields and metadata, so unchanged devices skip customer pages while manual Sheet edits remain detectable. Original queued events, AFSM dates, roles, licensing and the existing offline/backup architecture are retained. Backup validation also accepts the existing AFSM operation.

Synthetic validation: 1,000 unchanged versioned photos plus one remote addition transfers one photo; the subsequent unchanged sync transfers zero photos and zero customer pages. Drive fixture baseline resumes from a page token; unchanged discovery uses Changes API only, with zero folder-list and per-photo requests. Changed version/removal deltas, token expiry, pending replacement, missing-reference recovery and tenant rejection are tested. These tests do not constitute physical Android/Windows cross-device verification.

Deployment requirement: existing tenants must replace their Apps Script Code.gs and EDIT the currently used web-app deployment to a new version. A new separate deployment does not change the URL stored by Bank Setu. Script properties and customer data must remain intact. New setup downloads automatically include this source. No Firebase Blaze infrastructure or photo bytes in Firestore are introduced.
