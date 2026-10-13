# AFSM implementation and verification

Base: production `90cb91e773cf4e124b04692e3375f2e642fb6750`, version 1.0.74. An isolated AFSM branch preserves the previous licensing/background notification release.

## Ownership and dependencies

- Sidebar/routes: `src/Dashboard.tsx`, existing `canOpenLicensePage` policy.
- Search: `src/core/afsm.ts` reuses `localDataFetch`, verified bridge and stable customer IDs.
- Selection/new A4 list: `src/FormsSendToBranch.tsx`, `src/core/afsmPdf.ts`.
- Existing three-per-A4 PDF: `src/Customers.tsx`, unchanged `customerPdfBuilder` format. Confirmation captures the generated batch IDs and scope, independent of later UI filters.
- Shared explicit confirmation: `src/AfsmConfirmation.tsx`, `markCustomersAfsmSent`.
- Durable mutation: existing customer repository/IndexedDB or Electron database, existing QueueOperation and sync runner. A batch transaction retains all unrelated records and pending operations.
- Server confirmation clock: authenticated `/afsm-confirmation` Worker route; existing role, tenant, subscription and license verification apply. Offline/transient outage uses recorded device event time; delayed synchronization retains it.
- Cloud/pull: common `apps-script/Code.gs`, used by both master and downloaded client bridges. `markAfsmSent` updates an existing stable-ID row under the existing lock, operation ledger and revision checks.
- Preview: Customers field and All Customer Data preview field; sync notifications refresh the selected Customers record.
- Printing/saving: existing native Android PDF plugin and Electron customer PDF interfaces, browser PDF viewer/download. No print request, preview or download writes customer status.

## Safe Sheet extension and conflicts

A:AA retain their current positions and values. On the first AFSM sync, the bridge appends `BANKSETU AFSM JSON` and `Form Send to Branch` after all used columns. Existing custom columns remain unchanged. Named AFSM headers are reused; duplicates cause a review error. Normal customer updates still write their existing first 27 columns and retain AFSM metadata.

First confirmed date is preserved. A second device's stale revision produces the existing conflict-review state; it does not overwrite the first event. Administrators can accept the cloud version, then explicitly re-send from AFSM. A re-send requires its own UI confirmation. Queued operations replay idempotently through the existing operation ledger.

## Automated evidence

- Local suite: 137 tests, including AFSM durable batch, duplicate IDs, restart, original date, explicit re-send, atomic rollback, role/license/tenant isolation, real A4 PDFs and existing three-per-A4 regression.
- Worker suite: 34 tests.
- Bridge suite: 21 tests, including synthetic client user/admin/master AFSM, additive custom-column preservation, no new rows, retry, pull, original date and stale-device conflict.
- Updates: 13 tests; workspace regression: 6; portfolio: 2.
- TypeScript and production build passed. Hosting build passed.
- Rendered 21-customer PDF inspected: 20 rows on first page, continuous row 21 on second; heading only first page and receiver fields only last page.
- Synthetic authority test checks demo/annual/lifetime and rejects suspended/revoked/expired licenses.

## Release and external verification

The existing One Click App Release workflow automatically starts for production changes to `src/core/afsm.ts`, waits for the existing backend deployment gate, selects the next unused version, runs checks, builds a signed Android APK and a Windows installer (the existing Windows pipeline deliberately does not code-sign the EXE), publishes artifacts, then deploys Hosting. Metadata commits do not retrigger the AFSM push path. Do not overwrite concurrent production commits.

Apps Script project deployment requires the owner of each existing deployed script. A GitHub code release alone does not replace existing deployed Google Apps Script versions. Until that bridge is updated, local AFSM remains durable and pending with a specific update error.

Smallest owner step per workspace: use the existing client setup download (or repository `apps-script/Code.gs` for Master), replace Code.gs while retaining Script Properties, then Deploy > Manage deployments > edit the existing deployment > New version > Deploy. Preserve the existing Web App URL, execute-as owner and existing access settings. Verify `?action=status` returns `afsmVersion: 1`. Do not create new customer sheets or change connections.

Real Google Sheet updates and Windows/Android physical-device print/cancel/cross-device verification require the authorized workspace and devices. Automated synthetic tests are not evidence of physical printing or real customer-data verification.
