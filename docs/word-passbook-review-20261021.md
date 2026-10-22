# Assam Passbook Print Word typography review — not released

Base/unchanged backup: a1eaa58b15eae50d7b72cc87593998129f75397e, version 1.0.104.
Backup branch: backup/passbook-before-word-layout-20261021.

Reference rrrrrr.docx SHA256: f73f66b197926278a750bf70b501af7fa67607853db610ad09b9bff03770ea52.
OOXML Normal style selects Courier New. Every nonempty text run has w:sz=20
(10 pt), w:w=70 (70%), no bold/italic or additional character spacing.
The page geometry and sample customer content were deliberately not imported.

WordPassbookInfo renders Courier New Regular outlines at 10 pt / 70% for every
label, colon, value and footer glyph. All label/colon origins and value-slot
x/y/end coordinates remain derived from the original artwork. The 206 x 85 mm
SVG viewBox and containing 206 mm paper geometry are unchanged. No automatic
fit, truncation, per-character compression or field-specific spacing survives
in this renderer. Unsupported characters and overlong values block printing
and report their field. Empty joint holder retains its label and colon, with a blank value, without
moving any row. Existing data binding and temporary-edit rules are reused.

Font outlines: Microsoft Courier New Regular, cour.ttf, from the original
corefonts courie32.exe distribution, embedding fsType=0; 2048 units/em,
1229-unit monospace advance. Font SHA256:
6715838c52f813f3821549d3f645db9a768bd6f3a43d8f85a89cb6875a546c61.
The zero has exactly two contours (outer/inner), no central dot. Vector
embedding avoids platform font substitution in the app/PDF/PR2 raster path.
Original approved artwork and both Quick Passbook and Union renderers are
unchanged. No customer examples from Word are included in product code.

Validation: production build (TypeScript + Vite); 36 targeted unit tests;
existing approved-passbook browser flow (all four bank/menu combinations,
edit/cancel/search/tenant switching/print-status/licensing); PR2 browser
integration (mock IPC, actual PDF-to-raster conversion, Web/Android restriction).

Screenshots are from the actual src/Passbook.tsx menu mounted with the app's
styles in the browser test harness. Clearly synthetic customer and bank
fixtures enter through the existing search API interface; no real tenant,
Firebase account, sync connection or production customer data was accessed.
Run scripts/word-passbook.browser.mjs to reproduce both screenshots.
No physical printer testing or new physical alignment claim is made.

No version bump, production merge, release or deployment is authorized here.

22 October review: restored the JOINT HOLDER label for empty values. Further
colon spacing changes await resolution of the requested 3 mm versus 3 px
gaps and the common holder-colon/unequal-label-width constraint.

Follow-up correction: owner clarified 3 mm colon-to-data on both sides and
explicitly authorized extra compression for the JOINT HOLDER label only.
Implemented 1 CSS px (0.75 pt) reference-label ink-to-colon gap. All left main
colons align to BRANCH NAME, IFSC/MICR form a separate group, and ACC. HOLDER /
JOINT HOLDER form their own group. Both holder label starts and ink endpoints
align; customer values remain 10 pt / 70%. Value ink begins 3 mm after colon
ink, accounting for each initial glyph bearing. PO/DIST prefixes follow the
left value column. Paper, row baselines, source/Quick/Union artwork unchanged.
Replaces the earlier pending spacing question. Verified by targeted unit tests,
actual-component browser screenshot/ink-bound checks and production build.

Latest owner-approved correction (22 October): supersedes the 1px/extra Joint
Holder compression above. The reference-label ink-to-colon gap is now 1 mm.
JOINT HOLDER uses normal 70% compression; both holder colons are positioned
from its longer width, leaving the natural extra gap after ACC. HOLDER. Data
continues 3 mm after colon ink. All four address rows start directly under the
holder colon's left ink edge, while CUST ADD. stays in place. Customer address
rows are care-of; village/post; district/remaining locality; state/postal suffix.
Missing state/district is never filled from branch data. Unknown text is retained.
Only Word Assam Print mapping changes; Quick and Union remain unchanged.

Owner accepted the format and requested its reuse in Assam Quick Passbook.
Quick now uses WordPassbookArtwork + wordPassbookValues, including four address
rows, 1 mm label gaps, 3 mm value gaps, plain zeros and uniform 70% compression.
The existing Quick container offset (91 mm) and branch-code anchor (134 mm)
are retained so the fixed photo area stays in place. No hints, Aadhaar header,
photo box, logo, bank title, Head Office, manager signature area, page size or
Temporary Edit markup/styles changed. Both Assam modes use the same validation.
Union unchanged. Screenshot: scripts/word-passbook.browser.mjs --quick with
synthetic customer/Aadhaar/bank fixtures through the existing search interface.
