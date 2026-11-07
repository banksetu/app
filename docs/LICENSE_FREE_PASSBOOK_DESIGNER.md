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

## November 7 functional ribbon expansion — implemented in Draft PR only

- Home: in-editor Copy/Cut/Paste/Delete, undo/redo, Copy/Paste Format, lists, clear formatting, uppercase/lowercase/title/sentence-case and duplicate. Keyboard Ctrl+C/X/V operates only when the measured paper has focus; when direct text editing, native text input behavior remains.
- Insert: custom 1–8 by 1–8 editable basic table grid, header, footer and static page-number labels, images, shapes, bank/customer field boxes, special characters.
- Design: Quick-only page fill (Cream/Blue/Green/Gray), Quick-only watermark and border, heading/subheading/normal/caption object styles, selected-object color/border editing.
- Layout: rotate, layer forward/back/front/rear, group/ungroup, center on paper and measured Page Setup modal.
- Mailings: bank name, branch phone/address, MICR, GSTIN, customer CIF, nominee and account-opening-date placeholder insertion (fields only; never actual customer values in a shared template).
- View: select page objects, original overlay, grid/snap/guides, ruler and zoom.
- Double-click an **unlocked static text box on the white paper** to edit it in place, with basic browser spellcheck, Escape to cancel, Ctrl+Enter or blur to commit; changes use the same undoable draft model.
- Home/Insert buttons now visually grouped with labeled Word-style command families.
- Pure function tests cover text-case transforms, dynamic preview sanitization, physical page bounds and clipboard limits.

**Important:** The existing object editor does not yet support full Microsoft Word text runs, exact DOCX import-export roundtrips, tracked changes, charts/SmartArt, bibliographic documents or macro execution. These are **not implemented** and do not appear as fake controls.

## Not claimed or bundled
Native Microsoft Word, complete Office ribbon parity, macros/VBA, Microsoft SmartArt, proprietary font assets, native DOCX roundtrip, Word Track Changes, Office email merge and Office cloud features. Familiar generic editing commands may be implemented independently without Microsoft software; do not advertise them until functional and tested.

## Safety
Do not change customer data, sync, licensing, approved bank layouts, tenant isolation, or existing Direct PR2 print engine. No merge to main and no release. Windows screenshot/installer and physical Epson PLQ tests are separate acceptance gates.

## Design PDF interpretation
The PDF delivered in chat is a **vector UI concept and current draft feature walkthrough**, not a screenshot taken from a running Windows app. It intentionally distinguishes implemented subset from planned work.

## 2026-11-07 — Book-size fold selector and easy, working client tools

**Why this was changed:** In earlier draft code, the Horizontal / Vertical fold selector existed but was inside a second, less obvious *Fold / Book Spine* section below paper dimensions. Clients need it beside the width and height, so they can choose the correct physical passbook before placing text.

### Page Setup — full-open size + fold direction

- *Paper / Passbook Size* includes **Full open width**, **Full open height**, and 3 large visual choices: **Horizontal Fold (top/bottom)**, **Vertical Fold (left/right)**, **No Fold (flat/A4)**. These are folding geometry, not portrait/landscape orientation.
- The **Layout ribbon** also exposes **Book Fold** as a direct dropdown. Fold direction is shown in the persistent bottom editor status.
- Orange dashed line = physical book fold. Green dashed line = data-print start. The open/folded diagram updates to reflect selected axis.
- Changing axis preserves the *measured full-open size* and the previous *gap after fold* where possible. For example, 190 × 175 mm with 87.5 mm horizontal fold and 100 mm data start becomes 95 mm vertical fold and 107.5 mm data start: the offset stays **12.5 mm**.
- Existing X/Y-positioned labels are **not automatically moved**. Physical calibration flags are cleared, so alignment requires proof on the actual bank paper and Epson/PR2 after choosing an axis.
- Existing saved layouts and backwards-compatible fold metadata remain supported. No new print engine or data store is introduced.

### Familiar, compact top ribbon

- **Easy Tools:** Text Box, Table, Customer Name, Bank Field, Picture (Quick only), Book Size & Fold, Preview PDF, Save Draft. Every control invokes an existing draft editor action.
- **More Tools** opens an on-demand palette: Account Number, IFSC, Nominee, Rectangle, Line, Oval, Photo Box (Quick only), Object Format, Ruler and Grid.
- Existing Home / Insert / Design / Layout / References / Mailings / Review / View tabs, tool search and contextual Object Format remain available.
- Buttons have plain-language labels and hover tips, not decorative commands.
- No client data is copied into shared bank templates; Direct PR2 stays text-only. Nothing is automatically activated or published.

### Acceptance still needed

The latest CI suite includes regression tests for both fold axes, flat mode, open-book measurement preservation, and the ribbon tool wiring. GitHub build checks do not replace Windows screenshots or a real Epson passbook print. **Draft PR #100 only**, no main merge or production deploy.
