# BANK SETU — Cross-Word-Processor Ribbon Audit & Implementation Inventory
**Date:** 2026-11-07 · **Scope:** DRAFT PR #100 ONLY · **No production release**
**Design target:** approved BANK SETU reference artwork: navy left navigation, Word-like tabbed blue title/ribbon, measured white passbook, customer/bank field panel, bottom zoom/status.
**Technology:** original BANK SETU code; no Word/Google/WPS/ONLYOFFICE licence, code, fonts, branded icons or cloud account required to use the implemented commands.

## Primary vendor documentation surveyed
1. Microsoft Word ribbon and access keys: https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word
2. Microsoft ribbon customization: https://support.microsoft.com/en-us/word/customize-the-ribbon-in-word
3. LibreOffice Writer 25.2 introduction: https://books.libreoffice.org/en/WG252/WG2501-IntroducingWriter.html
4. LibreOffice 26.2 tabbed variants: https://books.libreoffice.org/en/WG262/WG26221-UserInterfaceVariants.html
5. ONLYOFFICE Editor interface and tab commands: https://helpcenter.onlyoffice.com/docs/userguides/document-editor/program-interface
6. ONLYOFFICE Home / Insert / Layout: https://helpcenter.onlyoffice.com/docs/userguides/document-editor/program-interface/home-tab
   https://helpcenter.onlyoffice.com/docs/userguides/document-editor/program-interface/insert-tab
   https://helpcenter.onlyoffice.com/docs/userguides/document-editor/program-interface/layout-tab
7. WPS Docs Quick Start: https://help.wps.com/d/2104741989660086273
8. WPS Docs catalog: https://www.wps.ai/en-us/docs/
9. Google Docs tool finder: https://support.google.com/docs/answer/13466905?hl=en
10. Google Docs menu/keyboard shortcuts: https://support.google.com/docs/answer/179738?hl=en-GB

**Method:** Consolidate feature families, not scrape/reproduce copyrighted user-interface assets. Different versions have different contextual tabs; "all tools" is not a finite invariant list across products. Do not confuse a free tool *concept* with a right to redistribute third-party software.

### Status legend
- **S** = existing in BANK SETU / integrated independent draft command; not a claim of native Word semantics
- **D** = independently feasible, proposed for further development/test; NOT implemented yet
- **N** = inapplicable or safety-restricted in the bank passbook editor
- **P** = production/workflow feature handled elsewhere; do not create a second engine

| Tab / family | Commands from surveyed products | Status for BANK SETU |
|---|---|---|
| File / New | Blank document, templates, recent docs, open | S: blank measured passbook, PDF/DOC/DOCX import; D: recent-document picker |
| File / Save | Save, save as, autorecover, version history | S: private local/cloud draft, backup JSON, conflict recovery; D: rich save-as formats; P: existing synced recovery |
| File / Publish | Print, print preview, export PDF, share, close, document info | S: proof PDF/calibration; P: existing PR2 bridge, Master sharing; D: document info and richer export |
| File / Protection | passwords, encryption, signatures, account options | P: existing tenant auth, roles, approval; N: duplicating password/DRM engines |
| Home / Clipboard | Cut, Copy, Paste, Paste special, format painter, undo, redo | S: in-editor object cut/copy/paste, undo/redo, style copy/paste; D: richer paste-special; no customer preview copying |
| Home / Font | family, size, grow/shrink, B/I/U, color, highlight, case, effects, strike, sub/superscript | S: family, size, B/I/U, color, case, text box background; D: strikethrough, baseline shifts, typography run model |
| Home / Paragraph | lists, indents, align, justify, direction, line spacing, borders, shading, tab stops, sort | S: basic list prefixes, measured indent/outdent, alignment, line/letter spacing; D: real paragraph lists/reflow, tab stops, bidi |
| Home / Styles | Normal, Headings, style sets, manage styles, clear formatting | S: independent object presets, clear format; D: named reusable style catalog |
| Home / Editing | Find, replace, select, word count, navigation, dictate | S: static-label find/replace, select, static-label word count, command finder; D: full proof navigation and dictation |
| Insert / Pages | blank, cover, section/page/column breaks | S: new measured page; D: cover templates; N: automatic flowing multisection Word text in PR2 |
| Insert / Tables | grid, table design, add rows/columns, merge/split, borders, shading, formulas | S: measured basic editable grid, custom rows/columns; D: real table structure and cell merge/split |
| Insert / Pictures | file image, graphic, photo, logo, icons, shapes, 3D models | S: local image and bank-logo placeholders, photo box, rectangle/ellipse/line; D: additional vector icons; N: embedded customer image in shared PR2 |
| Insert / Charts & SmartArt | charts, diagrams, process flow, interactive visuals | D: independent static SVG/shape diagram importer after security review; N: third-party proprietary SmartArt reuse, PR2 graphics |
| Insert / Links | hyperlinks, bookmarks, cross references | D: internal bookmarks and safe link metadata; N: clickable URL behavior in paper-printed PR2 |
| Insert / Comments | document comments, review threads | D: private layer-review notes, server-safe approval fields; P: Master Approval |
| Insert / Headers | header, footer, page number, date/time | S: editable static boxes, measured placement and static timestamp; D: automatic dynamic pagination |
| Insert / Text | text box, WordArt, drop cap, Quick Parts, signature line | S: text boxes; D: generic independent decorative SVG/typography, structured metadata; N: unverified signature/autograph claims |
| Insert / Math | equations, Greek symbols, math glyphs, special characters | S: safe symbols/text; D: editable formula layer; N: executing formulas or scripts from uploaded files |
| Draw | pen, highlighter, eraser, ink conversion, shape drawing | S: measured line/rectangle/ellipse & geometry; D: original vector freehand path engine with undo; N: third-party drawing plugins without review |
| Design | themes, theme color/font sets, page background, borders, watermark | S: Quick-only page color/watermark/border & object presets; D: reusable tenant-safe color themes; N: graphics in Direct PR2 |
| Layout / Page | size, margins, portrait/landscape, columns, sections, line numbers, hyphenation | S: width/height/mm/cm/in/orientation/margins/fold/print start; D: supported multi-column layout when justified; N: uncontrolled reflow invalidating printer coordinates |
| Layout / Arrange | wrap, anchor, position, rotation, move forward/back, align, distribute, group | S: measured object formatting, layer position, rotate/group/align/distribute; D: text wrapping/anchors to a paragraph model |
| References | TOC, captions, bookmarks, footnotes, endnotes, citations, bibliography, index, authorities | S: notes, bank reference placeholders, simple editable caption box; D: rich cross-reference/TOC (only for multipage documentation); N: unrelated academic citations in standard passbook printing |
| Mailings | envelopes, labels, mail merge, insert fields, preview merge, finish | S: mapped tenant-private customer and bank placeholders/preview; D: generic template data export with scoped permission; P: existing customer/share and printer flows |
| Review / Proof | spelling, grammar, thesaurus, language, accessibility, translate | S: native input spellcheck for direct editing, unreadable OCR review/audit; D: offline dictionaries and accessibility checks; N: unreviewed external AI sending bank data |
| Review / Changes | comments, revision tracking, accept/reject, document compare, protection | S: original sample visual compare, Master approval, local undo; D: local structured revision history; P: authorized Master approval not Word Track Changes |
| View | print/outline/read/web views, ruler, grid, navigation, zoom, multiple window | S: white paper preview, bank field panel, ruler/grid/zoom, overlays, layers; D: outline/reading display and keyboard navigation |
| Collaboration | coauthoring, comment threads, chat, sharing, version history | P: shared bank designs after Master approval, tenant-local draft recovery; N: unsafe public live coediting, second chat engine |
| Protection | document password, signatures, editing restrictions | S: individual object lock/unlock; P: existing Master roles/auth/tenant isolation; N: pseudo-encryption without security design |
| Developer / Plugins | VBA/macros, Office add-ins, third-party AI, script | N: never execute untrusted uploaded scripts or silently install external integrations |

## Newly integrated in this cross-product audit

- **Offline ribbon command finder:** search for supported actions using the same tool patterns clients know from Word's search and Google Docs' tool finder. Supports Alt+/ on the editor shell and runs a curated, independently implemented set of 29 actions. Nothing sends data to Google/Microsoft.
- **Contextual Object Format ribbon:** appears for a selected object, with bounded physical X/Y, width/height (mm), front/back, rotate, lock/unlock, colors and opacity.
- **References caption box:** inserts a separate editable static caption near a selected object (NOT an auto-numbering Word caption engine).
- These features complement, not replace, the approved reference screenshot, measured passbook editor or native PR2 printer bridge.

## Engineering acceptance criteria

Each new action must have: enabled/disabled rules, a real handler, undo/redo, draft persistence, tenant scoping, physical-page bounds, direct PR2 no-graphics guarantee, safe backend catalog output and Node regression coverage. Do not show fake tool buttons. Where a word processor has a command BANK SETU cannot accurately support, explain the limit rather than claiming complete Word equivalence.

The bank-specific preprinted passbook rules, same-bank Master-approved generic sharing, private customer values, 1–3 Quick and PR2 slots, and all existing auth/offline/licensing systems remain unchanged.

## Validation status

Draft-only commits. CI provides source/test/build evidence, **not** screenshot-match evidence or Epson PLQ physical certification. No `main` merge, Firebase deploy, printer change, or real customer data migration.
