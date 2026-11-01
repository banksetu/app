# BANK SETU automatic passbook engine — acceptance checklist (DRAFT)

Status: **NOT 100% certified**. This checklist deliberately does not equate a passing browser build with a physically correct bank passbook or reliable native printer output. Nothing in this file authorizes a merge or deployment.

## Non-negotiable safety
- [ ] Existing approved Assam Gramin, PNB, Union Bank and Central Bank templates confirmed unmodified through real print comparison.
- [ ] Customer, offline pending ops, deletion tombstones, licensing, attachment backups, per-tenant data and mapping unchanged. No alternative DB/bridge/print engines or silent Firebase writes.
- [ ] Catalog approval and template activation explicitly isolated to the same bank and tenant; customer values/images never enter shared generic templates.
- [ ] Quick Passbook keeps graphics, bank logo and permitted customer photo; Direct PR2/Olivetti prints **only** intended text labels/values (Union Bank: values only) using existing Windows bridge.
- [ ] A physically invalid layout, unsupported printer or failed/spooled job cannot mark a customer Printed.

## Actual reference samples and scanner calibration
- [ ] Engine must accept **any bank/passbook shape** independently: scanned PDF in A4, letter, landscape or direct-passbook canvas. It must NEVER require a photo or an Assam Gramin reference to function.\n- [ ] Automatic ROI and tentative dimensions available; when boundaries are uncertain, users can select crop edges and manually enter physical width/height/fold/print-start in mm/cm/inches. These measurements remain optional for draft editing but must be accepted before physical printer certification.\n- [ ] Physical printer acceptance may use a sanitised example of the relevant actual stock and recorded dimensions; this is a hardware sign-off task, not a requirement for PDF import or core software construction. A4 canvas dimensions must NOT be mistaken for physical passbook size.
- [ ] Crop compared against physical outer edges; fold, upper/lower panels and print start independently checked to 1 mm or agreed printer tolerance.
- [ ] A4 landscape and portrait, scan skew, 90/180/270-degree rotation, low-contrast, watermarks, mixed orientations and dirty page edges tested; unsure measurements must require review, not automatic activation.
- [ ] Different-size pages are separate templates. Saved local drafts survive unusable OCR or import errors.\n- [ ] Optional 0/90/180/270-degree scan rotation keeps reference and dynamic field positions in sync. Manual physical size must rescale x, y, width and height, not merely resize the white page.\n- [ ] Client can preview actual crop boundaries before applying any irreversible geometry changes; an undetected border must offer a manually editable crop, not pretend full A4 equals the passbook.

## OCR and digital-PDF reconstruction
- [ ] Offline OCR successfully tested on actual Windows, Android and browser devices, including Devanagari/Hindi and English, with user review of uncertain words.
- [ ] OCR unavailable mode preserves draft, explains the limitation and never silently uploads scan/customer values.
- [ ] Embedded PDF text, simple lines/rectangles, diagonal strokes and cubic stroke approximations match the source visually.
- [ ] Color profiles, transparency, nested graphics, gradients, images, complex Bézier paths and font substitutions compared individually with originals; approximation must be labeled, not described as pixel-perfect.
- [ ] Preprinted text, source graphics and overprinted customer values separated into independent editable layers; no unwanted labels duplicated on paper.
- [ ] A sample with no machine-readable text is handled conservatively rather than assumed successfully reconstructed.

## Preview and document QA
- [ ] Light/dark, small-screen/mobile, Windows preview, multi-page import, SVG-like editing, snap/grid, drag/resize, undo/redo, local draft restore and JSON export verified.
- [ ] Original-to-editor visual difference evaluated with reference scaling, correct fold coordinates and multiple passbook samples; human checks for Hindi typography.
- [ ] Print proof and live renderer produce the same text-only direct PR2 content; Quick mode includes only user-approved dynamic graphics.
- [ ] A4 account-opening form pages do not clip and respect existing bank-specific PDF sample requirements.

## Windows printer physical QA — repeat for each supported hardware/mode
- [ ] Verify the printer's exact nameplate model and selected emulation (PR2, ESC/P2 or other) before enabling any model-specific commands.
- [ ] Verify PLQ-20/20M on physical stock with passbook-detection, X/Y alignment, fold, margins, first/last line and paper eject/insert prompts.
- [ ] Verify PLQ-35 printer model, selected PR2 emulation, feed direction, width detection, margin and paper sensing on physical stock.
- [ ] Verify the model requested as PLQ-80 against the exact model-name label/manual before writing or enabling command profiles; no assumed PLQ-20 equivalence.
- [ ] Confirm preview-cancel, out-of-paper, jam, disconnect, retry and duplicate-job fencing without changing Printed state prematurely.
- [ ] Verify 1-page and multi-page passbook handling, physical paper replacement prompts and all relevant bank-specific alignments.
- [ ] Document pass/fail photo and mm offsets for each printer/bank and have the client admin approve them explicitly.

## Release validation
- [ ] Layout Studio Draft Validation: all layout tests, Worker security tests, existing bank/PR2 regressions and web build pass at **final PR head**.
- [ ] Windows unsigned installer packages and boots; packaged PR2 bridge present and integrity/permissions verified.
- [ ] Android debug APK builds, installs and launches; PDF import, OCR fallback, layout preview and print/share flows tested on a physical phone.
- [ ] Concurrent workspace activation/rollback and tenant isolation verified against staging fixtures (no destructive production writes).
- [ ] Master/Admin permissions and feature gating audited; sign-offs recorded for each bank/printer/device.
- [ ] Only then review merge and the existing One Click Release pipeline; do not enable live printing from draft CI alone.

## Reference data policy
Uploaded example images may contain real names, account numbers, signatures or identifiers. **Never commit them or copy them into public/shared templates, screenshots, test fixtures or logs.** Use generated fake labels/values in automated tests.

## Known verification limitation
The reference scan supplied during this work is a single image-only A4 sample of an already-built Assam Gramin layout. It cannot prove every layout, every scanner orientation or three physical Epson models. PLQ-35 vendor documentation lists PR2 among its supported control codes; vendor mode support is not proof that BANK SETU's bridge commands/positioning work on real hardware.
