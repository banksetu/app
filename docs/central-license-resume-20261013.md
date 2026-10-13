# Central licensing resumption checkpoint

Production branch: `codex/spark-client-workspace-20261001`.
Implementation branch: `codex/central-license-resume-20261013`, draft PR #19.
PR #17 and PR #18 are already incorporated. Do not implement or cherry-pick their foundation changes again.

## Source and production state

The source tree preserves production through `2bca6a205b02c17b8b3cfa8fd47814e080bfe910` (v1.0.71). Production `/deployment.json` and `/version.json` were fetched and still reported that commit/version. The deployed Hosting metadata says `kind: portfolio`; the existing publication workflow intentionally deploys the portfolio. Do not replace it with a different site.

No production customer, Google resource, license, Auth user, pending sync operation or backup was modified in this session. No production deployment, merge, version bump or signed release was performed.

Local shell Git push lacks credentials. GitHub connector tree/commit/ref operations successfully persisted the implementation with expected-head protection. The local and remote source trees were compared after the first upload and matched exactly.

## Implemented coverage

| Requirement from the visible resume instructions | State | Evidence / remaining verification |
| --- | --- | --- |
| Client creation in Master Admin Profile; no duplicate creation in licensing | IMPLEMENTED | Reused PRs #17/#18; authoritative tenant listing and creation event refresh. Real account provisioning is unverified. |
| Automatic new-client listing, deletion-aware totals and pending clients | TESTED | Synthetic Worker integration includes unassigned tenants, completed/partial offboarding, orphan licenses, expired Demo and independent users. Real production deletion was intentionally not performed. |
| Manage popup with Demo, Annual, Lifetime and calculated validity | TESTED | Reference-based responsive popup, plan radios, payment confirmation, date preview and Worker handlers. Render tests verify the controls and five-day expiry; physical-device interaction remains unverified. |
| Five-day full-access Demo and scheduled activation | TESTED | Worker, desktop guard and local access tests; expired/pending/suspended permissions fail closed. Backdated Demo is rejected. |
| Demo to Annual/Lifetime | TESTED | Reused and tested atomic server conversion/request approval, same tenant and retained workspace. Real client/device flows remain unverified. |
| Annual renewal / Lifetime upgrade | TESTED | Master `/license-admin-change`, existing client request flow, bounded credit, payment confirmation, revision/audit preconditions, retry protection and suspended/revoked/offboarding tests. |
| Client payment requests and Master approval | TESTED | Synthetic server tests cover reported UTR, duplicate references, authorization, approval/rejection and revision changes. Real bank receipt verification was not performed. Optional proof-upload acceptance criteria have not been recovered. |
| Central pricing and payment account details | IMPLEMENTED | Existing validated server settings retained. Reference example values were not installed as actual payment details. Real settings changes are unverified. |
| First-time registration after activation | TESTED | Four stages: authenticated details/preview, bank details, Google setup, verified completion. Unlicensed setup writes are blocked server-side. Existing resource connection does not hide incomplete bank registration. |
| Tenant Google setup and registration retention | TESTED | Registration uses field-mask PATCH; integration verifies Sheet ID, folder ID and bridge remain unchanged. Mobile is optional and validated. Google OAuth/Apps Script permissions with an actual new tenant are unverified. |
| First-install pricing / login View Pricing Plans | IMPLEMENTED | Reused PR #17. Plan request availability remains conditional on configured public CAPTCHA protection and plan availability. Real public inquiry is unverified. |
| Client status, start, expiry, countdown and credited price | TESTED | UI tests verify validity, countdown and price; live refresh/cross-device login tests remain unverified. |
| Blank customer PDF preview | TESTED | Browser test on 390px/1280px renders real PDF.js canvas pixels, scrolls three pages and replaces the document. Default canvas dimensions previously skipped all visible page rendering. |
| PDF generation/download/save/print | IN PROGRESS | Existing PDF/export/native print tests pass. Actual all/date/selected-customer preview, save/download/print on physical Android and Windows remain unverified. |
| Reference images and preserved theme | IN PROGRESS | User-supplied dashboard, assignment, payment details and setup images were inspected. Popup, table columns and count-card actions updated. Complete visual acceptance on real apps is unverified; no dummy support-expiry metric was added. |
| Every UI→handler→API→authorization→database→updated UI flow | IN PROGRESS | Targeted UI/render and synthetic API tests pass. They are not real customer/payment/device E2E tests. |
| APK and Windows EXE | IN PROGRESS | Earlier implementation commit `621db5d15744bb9a1eea86825139e25e2457b5bf`: CI run 38343193312 passed Android debug APK and Windows unsigned installer, Electron login and DPAPI restart smoke. Newer reference/setup changes require a fresh final-head CI run. These are not signed production releases. |
| Merge, backend deployment, signed release, Hosting/update verification | BLOCKED | Full original acceptance criteria and real workflows are not verified. Existing release pipeline requires a successful current-source backend deployment before publishing. Do not bypass that gate. |

## Original 18-task acceptance ledger

The complete original numbered master prompt was not present in the visible conversation and repeated Personal Context retrieval did not return its complete text. Do not invent its missing numbering or sub-requirements. The current visible resume requirements and supplied images drove the implementation above.

| Original task | State | Remaining |
| --- | --- | --- |
| 1 | BLOCKED | Recover exact original task text and map its acceptance criteria to the coverage above. |
| 2 | BLOCKED | Recover exact original task text; native notification criteria/device delivery may apply. |
| 3 | BLOCKED | Recover exact original task text. |
| 4 | BLOCKED | Recover exact original task text; first-time setup reference has been implemented. |
| 5 | BLOCKED | Recover exact original task text. |
| 6 | BLOCKED | Recover exact original task text. |
| 7 | BLOCKED | Recover exact original task text. |
| 8 | BLOCKED | Recover exact original task text. |
| 9 | BLOCKED | Recover exact original task text. |
| 10 — Client upgrade request (retrieved title) | IN PROGRESS | Real request/status/payment and all optional proof criteria. |
| 11 — Master payment verification (retrieved title) | IN PROGRESS | Actual receipt approval and refreshed client permissions. |
| 12 — Client license dashboard (retrieved title) | IN PROGRESS | Real device rendering and countdown/status across login/refresh. |
| 13 — Deletion consistency (retrieved title) | IN PROGRESS | Isolated disposable-tenant offboarding, login revocation and retained Google/customer data. |
| 14 — Customer PDF preview (retrieved title) | IN PROGRESS | Physical Android/Windows/Web all/date/selected generation, preview, download/save/print. |
| 15 — UI action integration (retrieved title) | IN PROGRESS | Every related button with real authorized backend and observed persisted update. |
| 16 — Reference implementation (retrieved title) | IN PROGRESS | Complete screenshot comparison and responsive interaction QA. |
| 17 — Regression testing (retrieved title) | IN PROGRESS | Final-head CI and remaining real-workflow/device checks. |
| 18 — Live release (retrieved title) | BLOCKED | Backend deployment, native signed artifacts, release publication, exact live SHA/version and update checks after all gates. |

## Continue without repeating work

1. Fetch the latest production and implementation refs before modifying anything; preserve newer work. The older `codex/closed-push-20261012` branch is behind production and its full-tree diff removes newer fixes; do not merge it blindly.
2. Inspect PR #19 and its latest Actions run. The final CI includes Firestore rules isolation, schema, existing regression suites, licensing/local/update tests, real PDF canvas browser tests, mobile login, Android debug packaging and Windows SQLite/DPAPI/Electron/installer tests.
3. Obtain the exact original numbered prompt and any remaining references; reconcile every original acceptance criterion. Request no passwords or secret keys in chat.
4. Use an authorized disposable tenant and real Android/Windows environment to verify transitions, refresh/logout/login/second-device status, setup, payment and PDF workflows. Preserve real customer data. Separate simulated evidence from actual-device evidence.
5. Only after all applicable acceptance gates: safely merge current production changes, deploy the existing Worker/rules pipeline, verify current-source backend health and connected tenant bridges, then use the existing signed app release pipeline. Verify public artifacts, portfolio metadata and software update behavior. Firebase Spark architecture and the existing Sync Engine remain unchanged.
