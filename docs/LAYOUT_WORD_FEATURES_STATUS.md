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
