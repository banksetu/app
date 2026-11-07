# BANK SETU — AI Layout Steps 1–3 Software Safety Audit and Migration

Status: **DRAFT IMPLEMENTATION**. This document is not a physical device certification, an authorization to release or evidence of production mutation. The existing BANK SETU one-click workflow is unchanged.

## Step 1 — inspected existing authority, storage, data and print flow
- Client identity source: `src/core/localData.ts::identity()` rejects missing verified UID/tenant/connection, expired offline permission and changed workspace. Never trust the tenant parameter on the UI or let an arbitrary caller choose another client's document scope.
- Local data authority: `src/core/customerRepository.ts` delegates to **existing** Web/Android `src/platform/web/indexedDbRepository.ts` (`banksetu-local-v1`/workspaces) or Windows `desktop/store.cjs` SQLite workspaces via existing `bankSetuDesktop.commit`. Both paths preserve existing customer records, queued operations, photo index, recovery metadata, licensing and database version. No new database or local storage engine.
- Existing `LocalState.documents` already caches bank format responses. New layouts live ONLY under reserved `__bankSetuLayoutSlotsV1` namespace and do not overwrite other document keys. Scope-keyed tenant+UID+verified connection ownership is preserved.
- Existing Cloudflare `cloudflare/worker.js` verifies account and active tenant/licence, checks bank config and role, then accesses Firebase via the established server-side Firestore service. The new 3 layout-sync routes are inserted into the existing supported and migrated route lists, NOT exposed as unverified public writes.
- Original bank selection/print flow, Quick/Direct PR2 separation, old passbook formats, physical printer bridge and customer operations are untouched by Step 1–3. Draft PR is not merged/deployed.
- Pre-existing localStudio `localStorage` drafts are migrated **non-destructively** only into the authenticated same-bank layout-1 slot, with the original legacy copy retained; corrupt/cross-tenant draft is never silently discarded or activated.

## Step 2 — bank-specific reusable layout slots in existing offline repository
- `src/layoutLocalState.ts`: pure, strictly bounded slot models and validated bank, mode, layout-1…layout-N identity, CAS edit revision, deep copies, no direct Customer/Sync/DB mutation.
- `src/layoutLocalStore.ts`: thin verified `identity()` + `customerRepository` adapter for Web, Android and Windows; no separate IndexedDB database or SQLite migration required.
- Each saved template keeps physical dimensions, fold, print-start, text/fields, font tracking/compression, dots/graphics policy and editable geometry. Original PDF/source/customer pixels are rejected from reusable slots; originals remain only as local reference.
- Existing Customer DB/Photo/Offline queue and active approved bank layouts remain intact. Reject local quota/invalid format/changed revision before overwriting anything.
- `CustomizeLayoutStudio.tsx` saves its current existing editor as **layout-1** and can recover cached slots; slot creation/backup/delete/tab selection intentionally belong to follow-up Steps 4–7 and are not falsely claimed completed here.

## Step 3 — compact cloud recovery via existing authenticated Worker
- `cloudflare/layoutCloudSync.js` enforces tenant + selected bank + mode + slot compound key, a bounded manifest (max 32 slots), per-slot revisions/hashes and gzip-base64 compressed design payload (max 95 KiB; uncompressed max 165 KiB).
- Publish: client-admin only, server `sanitizeLayoutTemplate` before compression, rejects unreviewed scanned graphics, raw account values, embedded images, invalid mapping and mismatched bank. Client `src/layoutGenericUpload.ts` performs independent pre-network generic field stripping.
- Write uses one atomic Firestore `:commit` for slot content + manifest, BOTH with update-time or exists:false preconditions and explicit expected manifest+slot revisions. Concurrent writes fail closed (HTTP 409), never silently last-write-wins across devices.
- Read: only client roles in the actor's own active tenant, matched to Bank Information. First request returns compact manifest metadata and changed hashes; download content ONLY for those slots absent or changed locally. Unchanged layouts are not downloaded.
- Client `src/layoutCloudRecovery.ts` checks bank/UID/tenant after each network step, verifies compressed byte length, gzip, SHA-256 and editable bank schema before committing to the local DB. Distinct authorized logins/devices of the same tenant recover all slots on online login; already cached designs work offline.
- If remote revision differs from an unsynced local edit, keep **both** (local live draft + incoming candidate) for explicit later conflict resolution; the local design and customer data are not overwritten. Owner-controlled deletion/backup and multi-tab UI are planned for Steps 4–7.
- No raw PDFs, private images, AI models, account numbers, customer identity records, credentials or full customer-state blobs are stored in Firebase. This is a small-data recovery extension to the existing Worker, not another competing sync engine.

## Scope and acceptance
- **Automated**: Node pure-slot, offline queue invariance, other-tenant rejection, new-device 3-slot recovery, conflict CAS, gzip/sha integrity, invalid data rejection, privacy sanitizer, Worker role/routing/CAS checks, legacy bank+PR2 regression, Web/Android/Windows build checks where workflow permits.
- **Not evidence**: Production Firebase write/Firestore billing measurement, real mobile/Windows installation or physical printer alignment. These require authorized deployment and post-release device tests; do not assert otherwise.
- **Future steps**: slot management UI, independent tenant deletion/backup, shared same-bank generic library, tabs, user authentication for deleting, and PDF cleanup. Their requirements remain recorded in `docs/LAYOUT_MULTI_TENANT_SHARING_AND_CLEANUP.md`.
