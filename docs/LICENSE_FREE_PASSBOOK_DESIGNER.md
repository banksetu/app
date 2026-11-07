# BANK SETU — License-free Word-like Passbook Designer (Draft #100)

## Decision
BANK SETU provides its **own editor**, styled with familiar ribbon tabs. No Microsoft Word installation, Microsoft 365 account, Microsoft license, Office automation, Office Add-in, WOPI, VBA, macros or Microsoft API is required for its supported editing features. The app does not bundle Microsoft proprietary icons, fonts or source code.

## User-facing workflow
1. Choose bank and import PDF / DOC / DOCX, or choose a blank passbook.
2. Choose Quick Passbook (graphics and photo) or Direct PR2 (dot-matrix text/values only).
3. Edit on the central physical-size paper. Use top File / Home / Insert / Draw / Design / Layout / References / Mailings / Review / View / Help ribbon and right-side Bank Information / Customer Data mapping.
4. Layout → Margins / Size / Orientation / Fold opens a closable Page Setup dialog.
5. Review unreadable OCR, overlapping preprinted labels and customer values; test preview and physical calibration.
6. Save private draft. Master approval and bank-specific printer calibration remain mandatory before any activation.

## Included, built-in, license-free features currently represented in the draft
- Local editable draft, undo/redo, text formatting and paragraph alignment, measured shapes, basic tables, simple symbols.
- PDF sample / Word DOC/DOCX import with explicitly limited fidelity; not native Word document editing.
- Bank/customer mapped placeholders, Quick/PR2 preview, per-bank measured page size and fold.
- Local backup and recovery, draft isolation, review/approval safeguards.

## Not claimed or bundled
Native Microsoft Word, complete Office ribbon parity, macros/VBA, Microsoft SmartArt, proprietary font assets, native DOCX roundtrip, Word Track Changes, Office email merge and Office cloud features. Familiar generic editing commands may be implemented independently without Microsoft software; do not advertise them until functional and tested.

## Safety
Do not change customer data, sync, licensing, approved bank layouts, tenant isolation, or existing Direct PR2 print engine. No merge to main and no release. Windows screenshot/installer and physical Epson PLQ tests are separate acceptance gates.

## Design PDF interpretation
The PDF delivered in chat is a **vector UI concept and current draft feature walkthrough**, not a screenshot taken from a running Windows app. It intentionally distinguishes implemented subset from planned work.
