# BANK SETU — Android regression after Windows-only Customize Layout decision

**Updated 5 November 2026.** Customize Layout and the automatic PDF-to-passbook editor are now **Windows EXE only**. This document replaces prior instructions to test the advanced layout editor on Android. Do not use an old Android APK to judge whether the new restriction is effective.

## New Android behavior

- The **Admin > Customize Layout** menu and both Customize Passbook / Customize Account Opening Studio pages must be absent.
- The Android app must not fetch Master-approved custom layout selections or render any new custom PR2 passbook template. The native Windows `banksetu:` Electron scheme and PR2 bridge are required for this engine.
- **Normal** Android BANK SETU customer management, ordinary approved bank passbooks, existing Bank Formats, Account Opening PDF sample selection, share/print, tenant sync, offline records, support, licensing and notification behavior must remain intact. This is a narrow engine restriction, **not** a general Android block.
- If an old saved route links to Customize Layout, a Windows-only explanation and safe return to Dashboard are shown instead.
- A web browser receives the same feature gate; native Windows EXE access still requires the existing role/licensing guards and explicit Master/Client approval to activate layouts.

## Existing app safety when checking a new APK

**Do not uninstall or overwrite** an existing production BANK SETU installation to test a debug build. Both can share package ID `in.banksetu.android` but use different signing keys. Uninstalling an active banking app can erase its local IndexedDB, unsynced queue and offline customer attachments. Test only on a spare Android device/profile with no real banking records or use a future separately approved test package configuration.

To obtain a draft debug APK, open the exact-commit GitHub Actions run for PR #98, download the `banksetu-layout-draft-android-<head SHA>` artifact and extract `app-debug.apk`. Artifacts last seven days. A PASS build alone is not an actual-device usability or privacy certification.

## Android regression checklist (later)

1. Log in using a **fictional test workspace**, inspect Admin dropdown and confirm Customize Layout is missing. Normal bank and customer menus must remain.
2. Select Assam Gramin, Union Bank, PNB, Central Bank and other configured banks; ensure unchanged supported formats still open, no cross-bank template substitution, and a missing Account Opening PDF prompts upload rather than inventing AGVB defaults.
3. Verify offline customer viewing/sync, normal preview, sharing and A4 printing with dummy data; check notifications and settings against the existing Android product requirements.
4. Deep-link/restore an old `customize-passbook` or `customize-account-opening` page and ensure no advanced editor or custom printing executes.
5. Record real-device pass/fail and app build SHA. Do **not** mark a printer hardware acceptance criterion PASS from Android behavior.

## Windows-only completion and release

Use `docs/LAYOUT_WINDOWS_ONLY_STATUS.md`, `docs/LAYOUT_ENGINE_ACCEPTANCE.md` and `docs/LAYOUT_HARDWARE_QA_INSTRUCTIONS.md`. Physical Windows installs, original-bank stock matches, actual Epson PR2 paper detection and real approvals remain required before enabling live custom passbook printing. This draft performs no merge, website deployment, production Firebase changes or One Click Release.
