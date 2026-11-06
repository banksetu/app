# BANK SETU Windows Studio — Word-style feature implementation status

Draft-only addition to PR #98. No production merge, Firebase migration, customer-data mutation, original bank print-layout modification or second printer engine.

## Implemented in this draft
- Multi-select with Ctrl/Shift+click and Ctrl+A on the design canvas; group and ungroup.
- Move groups together by drag or keyboard; arrows = 0.1 mm and Shift+arrows = 1 mm.
- Precisely align left/right/center/top/middle/bottom and approximate text baseline to the active reference object.
- Distribute horizontal or vertical spacing, or set an exact gap in millimeters.
- Equalize width, height or both; validate against physical page bounds, reject overlap/out-of-paper placements without silent clipping.
- Lock/unlock groups or individual design elements; locked objects cannot be moved/resized/deleted.
- Per-object multiline line spacing from 0.8 to 3.0, including 1/1.15/1.5/2 presets; Justify paragraph option.
- Preserve approved catalog and offline draft line spacing, lock and group IDs with worker sanitization and backward-compatible defaults.
- Reflect line spacing in on-screen preview, activated Quick preview, independent proof PDF and PR2 print preflight; keep original bank-specific print formats unmodified.
- Existing font tracking 0–10px by .5px and font compression 50–100% remain.

## Not implemented or not hardware-certified
This is **not Microsoft Word**. It does not yet implement rich runs (different bold/color inside the same paragraph), full tables and merged cells, section breaks, automated headers/footers, comments/track changes, true DOCX import/export, page-flow reflow, spelling/grammar checking, references/citations, collaborative coediting or smart object-snapping guides. Font baselines are approximate and must be checked with the real passbook; browser CSS and jsPDF do not guarantee identical glyph shaping.

Existing PR2 custom rendering still intentionally rejects unembedded non-ASCII text. The Windows test build can validate layout operations, but **actual Epson/PR2 paper alignment and safe-printed confirmation require physical user acceptance**. Never use a draft proof as production/customer print approval.

## Safety and compatibility
- Only Windows EXE exposes this new Studio; existing Android/web customer services remain unchanged.
- Group IDs, Lock flags and lineHeight are generic shape/format metadata, never customer values or scanned PDF data. Cloud sanitizer discards values/photos as before.
- Existing layout drafts without new fields remain valid. Default line-height is 1.18.
- Client Admin must submit a sanitized template; Master must approve; Client Admin must confirm physical dimensions/labels/print alignment before activating.
- Switching banks or clients invalidates selected template and protects tenant boundary.
- Direct PR2 prints only the bank-approved text/values, never photos/graphics or preprinted fields. Existing printer bridge remains authoritative.

## November 6 — Optional smart alignment guides (draft)
- Added a Windows canvas checkbox **Smart alignment guides**, independent of the legacy 5 mm grid snap.
- While dragging a single object or selected group, matching left/center/right and top/middle/bottom edges on other objects on the same page are magnetically aligned within a small screen-scale threshold, and non-printing cyan guides appear.
- Guides are ephemeral UI decorations: they are not saved to customer records, template JSON, catalog, proof PDF or print data. They disappear on drag end. Existing group bounds and paper clipping remain enforced; grid snap takes precedence if enabled.
- Added isolated guide math tests for edge/center alignment, no cross-page snapping, selected-group exclusion, distant objects, and invalid inputs.
- Not equivalent to the remaining full Microsoft Word functions (rich inline runs, tables, headers/footers, DOCX fidelity, pagination/reflow, revision tracking, collaboration, spelling/reference tools); those are **not completed** by this addition. Build/CI and physical acceptance still required; PR remains Draft.

## November 6 — Find and replace generic labels (draft)
- Windows Design workspace now has a scoped Find / Replace control for editable static text labels, optionally across all pages.
- Customer/bank field values, mapped field keys, preprinted layers, locked objects and unrelated pages are not silently changed. Locked matches stop replace rather than partially overwriting a draft. Uses existing undo/redo and re-requires physical confirmation.
- Automated tests cover replacement counts, case-insensitive matching, page scope, sensitive/dynamic exclusion, and input guards.
- Still no DOCX document parser/export, table editor, rich inline runs, flowing sections, comments or track changes. These gaps remain open.

## November 6 — usability redesign (draft, no deployment)
- Client-facing **Easy Layout Builder** opens in three clear stages: **Start** (choose Blank/PDF, enter physical dimensions and fold), **Design** (insert common text/customer/bank fields and select objects), and **Check & save** (compare Quick/PR2 modes, run audit, save offline). Steps do not erase draft data.
- Existing advanced editor, PDF calibration, label-splitting, OCR review, graphics, precision tools, multi-page controls, catalog and Master approval remain available under **Advanced tools**. Easy mode is UI-only and cannot activate/print without original approvals and safeguards.
- Added readable numbered step cards, contextual explanations, action emphasis, BANK SETU theme variables, responsive widths and reduced-motion CSS. No new images, fonts, heavy animation, sync/print engines or production backend changes.
- Source-level regression checks cover the three-stage UI, Windows-only runtime gating and approval flow. Automated build and real client testing are still required. This is not verified as professionally usable on every Windows display until human QA.
