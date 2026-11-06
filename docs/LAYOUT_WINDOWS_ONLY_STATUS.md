# BANK SETU Customize Layout — Windows EXE only / engineering status

**Scope:** Draft PR #98. No live deployment, reviewed merge, customer-data mutation or physical printer certification is implied by this file.

## Platform policy (5 November 2026)

- **Windows EXE:** Customize Layout > Customize Passbook / Customize Account Opening Form and the custom activated-template renderer are enabled **only** if the native `banksetu:` Electron origin, Windows PR2 preload protocol and original desktop repository bridge all exist.
- **Android APK and web browser:** no Customize Layout menu, no direct Studio route, no custom template selection fetch, no activated custom print renderer. Directly mounting the Studio returns a Windows-only message without mounting its editor hooks. The regular customer menu, existing bank passbooks, Bank Formats, Account Opening PDF and other Android functions remain unchanged.
- This runtime gating is a **feature availability restriction**, not an independently cryptographic hardware attestation for Cloudflare APIs. Existing role/tenant authorization and Master approval remain in force. Do not expose raw template activation endpoints without their ordinary authorization.

## Step-by-step code inventory

| Phase | Current software implementation | Remaining implementation / verification |
|---|---|---|
| 1 Scan calibration | A4 inset ROI, fold hints, quarter-turn/fine skew, manual mm/cm/in measurements, planar perspective correction | Nonplanar folded/warped scan quality and real-ruler validation |
| 2 OCR | Offline English/Hindi Tesseract assets, embedded PDF text preference, unverified-line correction workflow | Diverse real scans, handwriting/faded dots and accuracy acceptance |
| 3 Graphics | Editable digital PDF text, lines, simple rectangles, ellipses and bounded curve approximations | Exact complex vectors, gradients, clipped paths, raster reconstruction and specialized fonts (not fully coded) |
| 4 Layer splitting | Preprinted/printed customer overlays, explicit review, line split, dynamic data mapping | Hard cases with severe overprint and missing source reference |
| 5 Quick + PR2 | Separate Quick graphics and Direct PR2 text-only proof, Union values-only, existing Windows bridge, preflight and physical-ack gate | Native print reliability and Unicode/Hindi custom PR2 typography (incomplete) |
| 6 Review/isolation | Worker sanitation, Master review, Client Admin selection, conditional update and rollback, tenant-specific local drafts | Independent staging/concurrency/security acceptance, no production destructive tests |
| 7 Manual editor | Blank layout, drag/resize, ribbons, ruler, unit choices, typography compression/tracking, local draft and proof, guided Windows UI | Word-style editor is not full Word/DOCX; accessibility/usability on physical Windows still needs validation |
| 8 Hardware preparation | Customer-free mm calibration ruler, Epson-specific test instructions and simulated native bridge safeguards | PLQ-35 and requested PLQ-80 profiles/actual hardware command verification and real paper observations |
| 9 Regression | Layout tests, old-bank/Worker/PR2/offline tests in CI, PDF bounds and data-isolation guards | Human bank-by-bank visual comparison on approved actual paper and full installer usability |
| 10 Release control | Read-only release gate, CI checks, draft artifact packaging and exact head SHA attribution | Hardware and Master/Client Admin signoffs, peer review, reviewed merge and approved **existing** One Click Release |

**Completion statement:** 10/10 planned phases have implementation or guarded software scaffolding; this is **not** 100% implementation of every bank, artwork or printer requirement. No universal code-completion percentage can be verified from unit tests or lines of code alone. Major remaining *coding* gaps are complex artwork fidelity, custom Unicode PR2 and new hardware model profiles. Hardware/OCR accuracy and actual-paper signoff are additional *testing* gaps.

## Design/optimization

- Native Windows layout availability is lazy-loaded and fails closed outside EXE; no custom catalog lookup on Android/web.
- Professional layout shell includes clear native identity, measured-paper summary, Design Studio and Templates/Approval tabs, progressive display of the heavy canvas, dedicated editing controls, accessible focus and light/dark styles.
- The actual mm coordinates, source customer records, print bridge, bank modes and old approved passbook templates are not changed by visual styling.

## Windows build now vs production live

A **draft unsigned Windows installer may be built and downloaded today for manual QA** via `Layout Studio Draft Validation`. This is not a production release or verified installer launch. The workflow also stores a draft Windows installer artifact for 7 days.

**Do not declare a full live Windows release ready** merely because `npm run desktop:pack:unsigned` succeeds. Before enabling custom printer production: physically test required Epson models, prove actual passbook print/no duplicate, confirm Hindi/English data, original bank formatting, Client Admin/Master signoff and independent code review. `node scripts/layout-release-gate.mjs` intentionally blocks release while acceptance remains unsigned. An approved final release, if authorized later, must use the existing One Click App Release workflow; never create a competing release engine.

## Target-specific packaging optimization

The Android `npm run android:sync` builds with `BANKSETU_BUILD_TARGET=android` and then calls Capacitor sync. The web `npm run build:web` selects Vite mode `web`. Both use Vite aliases that replace the heavy `CustomizeLayoutStudio` and `WorkspaceTemplateDocument` lazy imports with the inert `src/platform/layoutUnavailable.tsx`. Windows `npm run build`/`npm run desktop:pack:unsigned` retain the complete editor. GitHub CI checks emitted JS/CSS for native-editor inclusion/exclusion before accepting draft packaging. This does not remove normal Android bank document support or alter offline sync/customer data.

## Word-style precision additions (November 6, 2026)
Draft PR #98 includes multi-object geometry, alignment, equal gap and dimensions, grouping and locking, editable paragraph line spacing, and Justify. New controls are client-side only and remain behind the native Windows gate. See [Word features status](./LAYOUT_WORD_FEATURES_STATUS.md) for what is *not* complete.
