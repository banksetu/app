# BANK SETU — Steps 8–10 physical verification and release worksheet

This worksheet describes REQUIRED future **human/device observations**; it is not evidence that any printer has already passed. Do not upload unsanitized passbooks, customer names, account numbers, full signatures or real customer data to GitHub. Work on PR #98 in draft, never auto-deploy.

## Step 8 — Epson physical calibration

1. On a Windows test machine install the **unsigned draft installer** built from the exact PR head. Confirm the application opens, bank/tenant are selected, and the existing PR2 bridge is loaded (do not use production customers).
2. Verify the precise **nameplate** model and emulation sheet. PLQ-20/20M is the existing documented profile; PLQ-35 requires model-specific verification. Do **not** assume that the user's requested PLQ-80 is compatible until its exact manufacturer/model/manual is confirmed. Do not bypass the model or PR2-mode confirmations.
3. Measure a blank/test passbook with a ruler: width, height, fold, lower printed panel, printable margins and X/Y baseline (all mm). A4 scanner canvas dimensions are NOT passbook dimensions. In Customize Layout, use **Export Physical Calibration Ruler (No Print)** to create a customer-free PDF with measured size and fold/print-start guides.
4. Use the selected printer's approved paper profile, run its **existing** device/probe/check, and print the already provided test grid **on sacrificial/test stock**. Verify auto-feed, paper sensor, insertion direction, physical dot density, top/last line, left/right margins and ejection. A calibration PDF is a regular PDF proof, not a substitute for model-specific PR2 command verification.
5. Verify X/Y offsets with a physical ruler and record the observed deviation to 0.5 mm where practical. Repeat with tracking at **0.5, 1, 2, 3, 4, 5 and 10 CSS px** and compression **100, 90, 75, 60 and 50 percent** using fictitious data. Inspect Hindi/English source font compatibility on Windows, Android PDF proofs and the actual printer; currently unsupported font encoding in custom PR2 is intentionally blocked, never silently treated as correct.
6. Check paper absent, jam, cancel before send, disconnect during send, retry after interrupted job, multi-page replace-paper prompts and accidental duplicate suppression. **Printed** may be set only after confirmed device completion AND human inspection of actual test stock. If any uncertainty remains, record FAIL and do not activate.
7. Repeat for **each real printer model and bank/stock pairing**. Do not copy an offset or profile between banks or printers without physical verification.

### Evidence form (one per printer and bank)

- Draft commit / build identifier:
- Bank name and bank template identifier (generic, no private account data):
- Physical printer manufacturer/model/nameplate:
- Printer firmware and selected emulation (PR2/Olivetti or other):
- Connection: USB / COM / LPT; serial values if relevant:
- Test stock W × H (mm), fold Y (mm), lower print area H (mm), print-start Y (mm):
- Printer selected dpi and configured X/Y offsets (mm):
- Observed X offset / Y offset (mm), first line and last line deviation:
- Font tracking tested and result:
- Glyph compression tested and result:
- Paper sensing / feed / no-paper / jam / cancellation / retry / duplicate protection: PASS or FAIL each:
- Quick artwork/font/photo placement vs Direct PR2 text-only (Union values only): PASS or FAIL:
- Reference comparison performed: YES / NO (without disclosing customer data):
- Client Admin physical inspection signoff (date/time and internal approval, never source customer data):
- Master review/tenant isolation signoff:
- Final per-bank/printer result: **UNVERIFIED / PASS / FAIL** (default UNVERIFIED)

## Step 9 — Every old bank, device and tenant

Run the repository layout, Cloudflare worker, PR2, Assam Gramin/PNB/Union/Central Bank passbook/PDF tests. Manually compare the existing **approved** prints with physical stock. Verify other-client access denied, local drafts tenant-separated, offline pending ops/tombstones unchanged, permissions and license flow unchanged, backup/Google Sheets & Drive mapping preserved. Never run destructive production tests.

On the actual Windows/Android app verify passbook PDF upload, offline Hindi/English OCR, graphic reconstruction warnings, Word-style blank layout, drag/resize, image-free direct print, light/dark popup and responsive controls, first and last lines, printer preview/print cancellation and performance with realistic (sanitized) samples.

## Step 10 — Existing One Click Release only after independent acceptance

- Final PR head passes layout CI, Cloudflare security, bank regression, Windows unsigned installer smoke and Android debug APK smoke.
- Complete every **pre-release** checklist entry in `docs/LAYOUT_ENGINE_ACCEPTANCE.md` **only after true independent evidence exists**. The final published-download-URL check is explicitly **post-release**: do not fabricate production links before a release.
- Run `node scripts/layout-release-gate.mjs` as a **read-only** last review; it exits nonzero if anything is pending. This is not a second release pipeline or permission to merge.
- Request code review + bank/hardware signoff. Only after acceptance, merge reviewed PR; use the **existing One Click App Release** workflow and verify website download, Windows setup, Android APK, version number and rollout. No silent Firebase production edits.
- **If any physical hardware is unavailable, STOP at draft.** Build success never means hardware pass or full release-ready.

This procedure deliberately leaves all real hardware/tenancy signoffs BLANK until collected. Never fabricate evidence.
