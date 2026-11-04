# BANK SETU layout engine — Android DRAFT APK test handoff

Status: **software-build test only**. This is not a signed release, physical printer certification, Android device pass, or authorization to deploy. Source: Draft PR #98, `codex/customize-layout-engine-phase1-20261101`. Keep all real customer records out of examples.

## Produce the Android test build (no production deployment)

1. In GitHub, open **Pull Request #98** and the latest **Layout Studio Draft Validation** workflow run. Identify the run's exact **head commit SHA**; only use artifacts whose SHA is the final tested commit. The `layout-studio` job must pass the layout, Worker, local, bridge, PR2, legacy-bank and offline OCR checks.
2. The `Android debug build smoke (draft only)` job runs `npm ci`, `npm run android:sync`, `./gradlew assembleDebug --no-daemon`, and verifies local English/Hindi OCR models are in the APK. On PASS it uploads `banksetu-layout-draft-android-<commit SHA>` as a **GitHub Actions artifact**, retained for **7 days**; download the artifact ZIP and extract `app-debug.apk`. If it expires, rerun the same draft workflow and check the new artifact's head SHA. This never publishes to the website, Play Store or Firebase.
3. **Do not uninstall or overwrite an existing production BANK SETU installation.** The debug APK uses the application ID `in.banksetu.android` and a debug signing key. Installing it over a differently signed release will be rejected; uninstalling a production app can permanently erase its local IndexedDB/offline operations, tenant data and attachments. Test on a **separate/spare Android device or fresh test profile where no production banking data exists**. Do not disable security protections or reset the real customer's app as a workaround.
4. Physical-device tests are **deferred** per request. A CI-built APK proves only that the software assembled; successful launch, Firebase login, background notifications, OCR quality, Android print/share and device performance must be observed later.

## Later on-device checklist — use fictional test data only

- Verify login and authorized Client Admin > **Customize Layout > Customize Passbook / Customize Account Opening Form**. The menu requires appropriate role, bank configuration and license.
- Test a blank Word-style layout without source PDF. Move/resize text, set measured paper W/H, fold, print-start, fonts, 0–10 px tracking, 50–100% font width, ruler units, Undo/Redo, save and reload through the same tenant. Confirm paper size and objects are not distorted.
- Import A4 scanner PDFs (English/Hindi, image-only, mixed text, landscape/portrait), correct ROI/rotation/perspective and OCR review, then export a **draft** proof. Test offline OCR after assets have been bundled. Never treat a scanner's 210 × 297 mm A4 page as the physical passbook size.
- Verify Quick preview shows approved art/logo/photo placeholders and Direct PR2 proof omits photos, logos and shapes; Union Bank must remain **values-only**. PR2 hardware transport is a **Windows-only bridge**. Android cannot certify or directly drive Epson PR2 hardware in this draft.
- Verify dark/light UI, mobile layout, no clipped controls, no unexpected sharing of private fields, no tenant crossover on account switch. Check normal Android app print/share dialogs only with test data and without changing a real customer's Printed state.
- Do not activate any unverified bank template. Activation requires the existing Master-reviewed catalog plus independent **physical stock, preprinted-label, actual-printer calibration** confirmations. The Android APK build cannot satisfy those confirmations.
- If a selected bank (including Central Bank or PNB) or format is absent in the **actual installed build**, record as a software blocker. Do not report a missing legacy format as tested merely because the generic layout engine accepts arbitrary bank names.

## Hardware/approval after Android trial

See `docs/LAYOUT_HARDWARE_QA_INSTRUCTIONS.md` and `docs/LAYOUT_ENGINE_ACCEPTANCE.md`. Physical Epson PLQ-20/20M, PLQ-35 and the requested PLQ-80 model/emulation need separate actual-paper sign-offs. Leave release gate and One Click App Release untouched until real approval. Debug APK artifacts are for local testing, not public links.
