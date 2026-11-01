# BANK SETU — Built-in Automatic Passbook and Account Opening Layout Studio

Status: **DRAFT IMPLEMENTATION** (PR #98). Do not enable production printing on editor/raster tests alone.

## Placement
Admin dropdown > Customize Layout > Customize Passbook / Customize Account Opening Form. Parent is above License Management and Logout, lazy-loaded, supports document-level light/dark appearance and responsive mobile design.

## Contract
- Preserve existing Assam Gramin, PNB, Union Bank, Central Bank, current approved layouts and PR2/Olivetti print modes.
- Customer data is tenant-bound. Shared bank templates contain generic geometry and labels only; approval requires Master review.
- Client Users may prepare drafts; Client Admin submits a generic layout, Master Admin reviews. Drafts/approval never send printer jobs.
- No secondary sync or database engine, schema replacement or silent Firebase changes.
- An A4 scanner page is not the passbook. A4 paper scale can be provisional; user-approved crop shifts editable coordinates. Optional ruler measurements in mm/cm/inches.
- Digital PDF text, simple vector shapes and optionally native browser OCR are converted to editable objects. Source page images are in-memory comparison references ONLY, never pasted into Quick output.
- Elements: static/preprinted label, customer/bank dynamic fields, dot-matrix layer, logo/graphics/photo box, manual overlap separation.
- Quick Passbook full color; dot-matrix outputs only required labels/values, omitting paper-preprinted labels. Union Bank values-only.
- New Bank Information fields must not mutate historical Google Sheet/Drive mapping.
- Reuse a Master-approved generic template for the same selected bank or upload one's own PDF.
- Individual temporary print edits never update the template/customer database.

## Current draft functionality
- Office-style visual editing: layer drag/resize, precise X/Y/Z, rotation, font/size, spacing, style, color, rectangle, ellipse, line, photo box, separate logo/graphics, multi-page, zoom, grid/snap, undo/redo and local draft JSON export.
- Embedded PDF text import, label and overlap suggestions with per-label confirmation, on-device optional TextDetector OCR where supported, supported vector lines/rectangles.
- User-confirmed A4 scan-bound estimation, editable paper dimensions/fold/print start, temporary original overlay and local pixel difference diagnostic.
- Quick and dot-matrix unapproved PDF proof outputs; optional existing PR2 rasterizer compatibility, without printer contact.
- Audit checks for page bounds, field mappings, fold line and values-only bank special rules.
- Worker validation of custom bank fields and Master-moderated cross-tenant generic catalog. Personal values and unreviewed image pixels are stripped.
- Minimal CI including node tests, worker security tests and TypeScript/Vite build.

## Mandatory unfinished work before claiming completion
1. Reliable scanned-image OCR on Windows, Android and web (native TextDetector is not universally supported), Hindi/script handling, overlap recognition and confidence validation.
2. Complex PDF graphics reconstruction: Bézier paths, color profiles, transparent objects, gradients, fonts, images and automatic full design reconstruction.
3. Connect versioned approved templates to actual customer data and account opening print pipelines; automatic existing PR2 rendering activation with no duplicate engine.
4. Physical Epson PR2/Olivetti tests, alignment offsets, passbook sensing, duplicate job recovery, fold printing and multi-page insertion prompts.
5. Backend integration/tenant permission tests, versioned activation, historical rollback and review approval.
6. Original-paper print verification for Assam Gramin, PNB, Union, Central Bank and SBI, including color, spacing, page and fold geometry.
7. Windows installer and Android build smoke/regression, light/dark visual QA, performance and accessibility.

## Release gate
No merge or live deploy until tests and physical sign-off. Automated OCR and pixel comparison never alone certify 100% fidelity. Existing bank/customer records and PR2 are untouched by draft QA.
