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
