# BANK SETU — Guided Passbook Designer (Draft PR #100)

**Status:** Draft engineering only; never merged to main or deployed.

The known-good production version reported by the owner is v1.0.141; do not assume the checked-out package.json version is the deployed version.

## User workflow and current implementation
| Phase | Implementation in this draft | Remaining / acceptance |
| --- | --- | --- |
| 1. Bank selection | Windows-only wizard, existing Bank Information options and custom-name draft | Custom bank registration/tenant ownership approval, final UI on Windows |
| 2. Method | PDF, DOCX, blank; separate Continue Editing entry | Binary DOC import is NOT implemented; DOC requires external conversion to DOCX |
| 3. Mode | Quick graphics / PR2 text-only chosen before editor; separate draft slots 1–3 for each | Backend approved-template routing to 3 live Quick + 3 live PR2 slots not yet implemented |
| 4. Conversion | Existing offline English/Hindi PDF OCR and scan calibration; bounded offline OOXML DOCX paragraph importer with Unicode punctuation and warnings | DOCX image/shape/table/section/floating-object fidelity; OCR reference comparison, actual A4 inset and real scans |
| 5. Word-style editor | Home/Insert/Layout/Design/Review/View functional Word-style ribbon, existing font/paragraph/formatting, shapes, alignment, groups, ruler, canvas; removed obsolete duplicate three-page widget | Full native MS Word features are not implemented (rich mixed runs, true tables, headers/footers, arbitrary reflow, DOCX roundtrip) |
| 6. Drag mapping | Draw a box on page then select Customer or Bank source and a field; legacy customer key aliases supported | Better field picker, manual A11y/keyboard and touch usability |
| 7. Preview, autosave, backup | Same-tenant read-only real customer picker (values memory-only), offline template PDF preview; debounced local draft saves and throttled private cloud recovery for **reviewed generic drafts**; lossless same-bank JSON export/restore | Unreviewed Word/OCR drafts are **not sent to the existing generic cloud backup** because they could contain personal data; secure private encrypted pending-draft schema/Firestore rules require additional implementation |
| 8. Master review | Original audited generic submit/approve/reject, now explicit Save & Send to Master action; unsafe/unreviewed OCR cannot be automatically published | Real client/Master user acceptance; optional review comments |
| 9. Apply/PR2 | Existing approved template activation & existing PR2 bridge remain gated by physical checks; separate local draft slots | Approved template mapping into each of 3 runtime slots; automatic safe routing Quick vs PR2, exact printer model and physical X/Y sign-off |
| 10. Validation/release | Draft CI workflow, unit tests, unchanged main branch | Full Windows/Android/web regression, manual passbook and Epson hardware acceptance before a future approved release |

## Code cleanup
- Removed obsolete duplicate in-editor Easy Layout Builder and its unused CSS. The replacement bank/method/output wizard is authoritative.
- Kept existing OCR, Worker, local database, catalog, PR2 bridge, legacy bank format and platform-gating code because those are referenced production dependencies.
- No repository-wide destructive purge, no branch deletion, no force-push, no new backup files, no customer-data deletion.
- Do not remove uncertain files based solely on filename or date. A verified import graph and independent review are required before any further deletion.

## Security and release rules
- No unreviewed OCR/Word data or real customer preview values in shared templates.
- Cloud recovery uses the existing BANK SETU worker and tenant repository; it does not introduce a second sync engine or create a new Firebase production schema.
- Client bank mismatch disables real customer preview; actual bank configuration is needed before Master submission.
- Quick Passbook graphics must not enter text-only PR2. Union Bank remains values-only.
- The **six local draft slots are not six activated live print slots**; do not describe them as such until backend/runtime route changes are verified.
- Master approval alone must not bypass physical calibration; never mark Printed before the existing bridge confirms printing.
- Do not merge or deploy. Physical printer, OCR and per-bank human verification remain mandatory.

## Next steps
1. Run and fix CI compile/test failures at the current PR head (latest new UI work requires repeat validation).
2. Finish the safe DOCX fidelity strategy and all document import warnings.
3. Implement typed 3+3 approved live slot routing with backward-compatible tenant data migration, Worker authorization and runtime-specific test coverage.
4. Add secure server-side reviewed/pending-draft cloud recovery or local-only incomplete draft policy without introducing private data leakage.
5. Run unsigned Windows installer/Android smoke and manual paper checks; keep main/production unchanged.


## Measured book-fold Page Setup (2026-11-06 draft addition)

The passbook designer now exposes a single **Layout → Page Setup** control group with:
- Full OPEN book Width × Height in mm, cm or inches, Portrait/Landscape and measured sample presets.
- Horizontal book crease, vertical spine or flat document. Fold Exactly in Half, absolute data-start baseline and calculated distance after fold.
- Four independent margins (left/right/top/bottom) with validated editable-region geometry and real-scale ruler guides.
- Open Book vs Folded Book preview to visualize the physical closed cover and both printable halves; actual drafts and proof PDFs use measured open-paper width and height.
- Blank-page creation no longer discards an existing measured fold / printer-start coordinate; object placement starts after the selected baseline where geometry permits.
- Optional pageSetup is validated in local drafts, tenant-private Firestore backup, generic cloud backup, Master catalog and active runtime; historical layouts without it remain backward compatible.
- Any changed fold, paper size or margin revokes previous sample/label/printer calibration sign-offs and cannot activate PR2 without fresh verification.
- The fold lines and margins are **preview/editing guides**; they do not silently move existing bank-approved X/Y values or create a competing printer driver.
- Vertical fold/side-spine must be confirmed with actual physical PR2 positioning; hardware-specific output quality cannot be established by UI/software checks.

## Word ribbon tool inventory (Microsoft Word-inspired, not Word itself)

Reference: https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word

| Tab | Working passbook designer actions |
| --- | --- |
| File | Save draft, export/restore editable backup, calibration PDF, import PDF/DOC/DOCX |
| Home | Font family/size, B/I/U, paragraph alignment, letter/line spacing, undo/redo, format copy/paste, bullet/number prefix, object duplicate |
| Insert | Static text, mapped bank/customer fields, images/placeholders, shapes/line, editable table grids, symbols and special characters |
| Draw | Editable rectangles/circles/lines and drag-to-create customer/bank data boxes |
| Design | Object text/border colors, style copy and paste |
| Layout | Full open book, physical size, custom margins, fold, print start, orientation and object alignment/distribution |
| References | Editable notes/terms and bank/customer reference fields |
| Mailings | Dynamic tenant-safe bank/customer merge fields and preview with customer data |
| Review | Static-label find/replace and manual OCR/label review from existing editor |
| View | Ruler, grid, zoom and Quick vs PR2 preview |
| Help | Keyboard shortcuts and guided links to the relevant workspace tool groups |

**Scope honesty:** This is a banking document layout editor, not a clone/license of the Microsoft Word application. Word-only capabilities such as VBA/macros, native academic bibliography, email mail-merge delivery, exact DOC/DOCX roundtrip, rich-text sections/headers/footers, full tracked-changes semantics, SmartArt and arbitrary embedded Office objects require separate substantial engineering. No dead buttons were added to claim parity.

### Validation
Run `scripts/layout-page-setup.test.mjs`, `cloudflare/layoutTemplates.test.js`, full node/Worker tests and the draft Windows unsigned / Android debug packaging workflow. Check the actual Windows Page Setup and Epson samples separately; do not promote this draft to main automatically.

## November 6 follow-up: implemented software gates

The original progress table above is a historical snapshot, not the current source of truth. New draft code now includes:
- Read-only legacy Word 97–2003 DOC text extraction (not full binary Word fidelity) and improved DOCX text/table/run import; unsupported structures are explicitly flagged.
- Private, tenant-scoped draft cloud read/save for unfinished layouts using the existing Worker, Firestore document revisions and authorization checks. This is distinct from the generic Master catalog and does not publish drafts.
- Quick and PR2 three-slot selection in the Windows customer document workflow, with approved-template lookup and fallback to the original bank print format. Draft slots are not automatically activated without original Master and physical gates.
- A release-gate evaluator, calibration proof PDFs, layout preflight, worker tests and platform target checks.
- A conservative read-only unused-code report at `node scripts/audit-layout-unused.mjs`; it does **not** delete modules or backups.
- Draft-only CI with Linux unit/build tests and unsigned Windows/Android debug jobs. **CI green does not certify physical Epson printer alignment or that the installer launches on the owner's PC.**

The acceptance target is software completeness, not a false claim of Microsoft Word 100% feature parity. Arbitrary Word sections, all binary DOC formatting, exact Epson mechanical calibration and actual Windows install remain outside what can be proven in this environment. Production stays untouched.
