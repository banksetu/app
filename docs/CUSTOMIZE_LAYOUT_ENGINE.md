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
- Tenant-specific client-admin template activation with server-side same-bank approval checks, three physical acceptance confirmations, atomic version history, rollback and disable.
- Opt-in activated templates now render dynamic customer and bank values in the custom-bank customer search flow (Quick, Dot Matrix or Account Opening) without touching existing non-activated bank layouts.
- Approved single-page custom passbooks can use the existing Windows PR2 Bridge with model/PR2 checks, paper sensing and interruption fences; customer status is changed only on confirmed PR2 success with a verified row number.
- Minimal CI including node tests, worker security tests and TypeScript/Vite build.

## November 1 follow-up — scan-only reference and PR2 proof hardening
- An A4, image-only Assam Gramin example was reviewed locally as a **reference only**. It contains no embedded PDF text. Do not commit the customer's account details or sample image, and never alter the existing approved Assam Gramin layout from this scan.
- A4 ROI now offers a tentative whitespace **fold-gap suggestion** where the upper and lower printed halves are distinguishable. It is low confidence, remains a draft, and requires ruler/real-paper acceptance. This does not infer actual physical size if the scanner resized its A4 output.
- Crop/overlay preparation is atomic: invalid image crops do not shift live draft objects. Geometry changes revoke earlier physical and hardware confirmations.
- An image-only PDF with no supported OCR must never overwrite existing unsaved local draft data or pretend unrelated old fields came from the new PDF; it leaves the draft untouched and explains the OCR limitation.
- Draft audit rejects invalid page/fold measurements and graphical elements in dot-matrix output. PR2 proof itself also excludes artwork/photo/lines even if individual flags were misconfigured.
- Quick proof uses the real PNG/JPEG/WebP image MIME; layout tests now include A4 fold probes, PR2 PDF-content verification, paper validation and bank-specific regressions.
- Do not treat tests, pixel differences, scan OCR or visually similar screenshots as physical paper approval.

## November 2 — opt-in truly bundled OCR (draft)
- Tesseract.js v7 is pinned in package-lock with English and Hindi language-data packages; WASM/worker/model files are copied into Web, Windows and Android build outputs. OCR never uploads customer scans to external services.
- The offline OCR runtime lazy-loads only when needed, after native TextDetector is unavailable or fails. Both digital+scanned sparse mixed PDFs can be reviewed; every OCR-imported line requires explicit correction/acknowledgement and cannot be shared or activated while unreadable.
- Static OCR models are copied during build without network requests. The web Service Worker caches large static language assets only when users invoke OCR, rather than preloading during login. Windows/Android installers include models in their packaged app assets.
- CI includes a real Node/WASM bilingual-model initialization and local-image recognition smoke test after build, plus a no-network packager fixture. Passing it does NOT establish accurate Hindi text on all scans or hardware compatibility.
- The PDF and scanner import remain generic to any passbook bank/shape, with optional manual crop dimensions, orientation, fold and print-start. No Assam Gramin layout was changed.
- Do not label this engine 100% certified until real device OCR, scan perspective/skew, reference-art color/font verification, printer model support and physical alignment approvals are complete.

## November 2 — cross-platform OCR packaging correction
- Android's asset packaging changed the gzip-suffixed language filenames. The build step now explicitly decompresses pin-locked ENG/HIN language models to raw `.traineddata` and starts Tesseract with `gzip:false` on every target.
- Verified in draft CI: Node/Vite build and real local bilingual OCR worker test pass; Android Debug APK builds and contains both expected language assets. Windows installer smoke is checked independently.
- Heavy Windows/Android CI jobs restored to manual-only trigger after testing to avoid unnecessary runner usage.
- Draft software tests are not real printed-passbook or OCR character accuracy evidence.

## Mandatory unfinished work before claiming completion
1. **Real-world OCR accuracy acceptance:** bundled local English/Hindi Tesseract now runs in CI, but must be tested on actual Windows/Android/Web devices and diverse Hindi/English passbook scans; handwriting, faded dots and overlapping print still require manual review.
2. Complex PDF graphics reconstruction: Bézier paths, color profiles, transparent objects, gradients, fonts, images and automatic full design reconstruction.
3. Complete end-to-end Windows and Android acceptance of the new opt-in rendering path; built-in Assam/Union formats intentionally keep their approved existing engine unless a separately reviewed migration is supplied.
4. Physical Epson PR2/Olivetti tests for every requested model/mode and layout, actual fold/print start, paper sensing, output comparison, duplicate job recovery and multi-page insertion prompts. Existing PR2 bridge supports confirmed PLQ-20/20M; PLQ-35/80 require verified printer command profiles.
5. Full backend integration/tenant permission tests and independent review of versioned activation/rollback under concurrent updates. Automated unit checks alone are insufficient for production.
6. Original-paper print verification for Assam Gramin, PNB, Union, Central Bank and SBI, including color, spacing, page and fold geometry.
7. Windows installer and Android build smoke/regression, light/dark visual QA, performance and accessibility.

## Release gate
No merge or live deploy until tests and physical sign-off. The selectable runtime path is feature/role and approval gated, but no real-bank passbook sample or hardware output was validated during this chat. Automated OCR and pixel comparison never alone certify 100% fidelity. Existing bank/customer records and PR2 are untouched by draft QA.

## November 3 — Steps 1–4 (draft implementation, NOT printer certification)
**Step 1 / Global scan calibration:** the A4 scanner surface is not a passbook. Bounded ROI/fold/skew hints, independent manual paper dimensions and fold/print start, optional quarter-turn + fine deskew, and explicit four-corner trapezoid rectification now map the ORIGINAL preview and PDF text objects into the same page-local coordinates. Corners are validated as a convex non-crossing quadrilateral. This is a planar projection approximation; strongly wrinkled/warped scans can require human reconstruction. Unsupported scans are NEVER automatically approved.
**Step 2 / Offline Hindi-English OCR:** the app includes local English/Hindi WASM models with no cloud OCR customer-data uploads. Small native detections are cross-checked with bundled offline OCR, imported scans may use temporary higher-resolution images, and sparse mixed digital+image pages are scanned. Embedded PDF text is imported before OCR so it cannot be crowded out by guesses. Exact overlapping OCR/PDF duplicates are reconciled, but different customer values are kept for human review. Every OCR line remains UNVERIFIED until manually checked.
**Step 3 / Reconstruct editable artwork:** digital PDF rectangles, diagonal strokes, bounded Bézier-stroke approximations and standard four-segment ellipses are independent editable shapes. The source is inspected for raster art, gradients, clipping, blending and unsupported curves. These deficits are visibly flagged, stored in local draft status and rejected by both client audit and server-side sharing until the user attests to reconstructing REQUIRED artwork. No scanned page is shared as a flattened image.
**Step 4 / Split preprinted and overprinted lines:** printed-label classification starts UNKNOWN; users must explicitly decide which labels are on paper before applying suggestions. OCR corrections must be reviewed, and the mapped split tool creates only a generic customer/bank field — no copied OCR customer value, default or photo. Mixed PDF/OCR text and page-local collisions are reviewed independently. Local editing/Undo/Redo snapshots are not mutated by label classification.
**Validation boundary:** draft CI runs Node layout, Cloudflare security, bank PDF, existing PR2 regression and Web build. Device-by-device Hindi OCR accuracy, severe non-planar scan warp, arbitrary raster-to-vector reconstruction, pixel-perfect bank printing and physical Epson stock/feed alignment remain unverified. These are not achieved merely by passing CI. Existing approved bank passbooks and customer data must remain unchanged; this draft must not be merged or deployed without acceptance.
