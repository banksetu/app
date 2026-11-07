# BANK SETU — Microsoft Word Ribbon Parity Contract (Draft PR #100)

**Reference lock:** user-approved navy/blue/white Passbook Layout Designer images.  
**Target:** Microsoft Word for Microsoft 365 **Windows desktop** command organization, with passbook-specific tenant-safe field mapping.  
**Status:** acceptance specification and gap inventory — NOT a statement of achieved feature parity.  
**Release:** DRAFT only. Never merge to main, publish a release, or deploy Firebase from this task.

## Important scope distinction

Actual Microsoft Word is a separately licensed product. BANK SETU's current object-based layout editor is **not Word**: its support for text, tables, imports, page reflow and revision semantics differs substantially. Even visually similar ribbons do not grant the native Word capabilities. Microsoft 365 adds user-configurable and contextual ribbons, and commands change by license, version and selected object.

If the hard requirement is literally **all native Word commands** with the exact Word behavior, use the licensed Word application and an authorized add-in / secure document interchange. Microsoft Office Add-ins run **inside Word**, not inside BANK SETU as a cloned Word instance. Microsoft 365 for the web embedding through WOPI is restricted to approved Cloud Storage Partner Program vendors, requires applicable licences, and cannot be assumed available or Spark-plan compatible.

## Ribbon coverage checklist

Every item below MUST be classified as **implemented + tested**, **blocked** (with reason), or **not yet implemented**. Missing UI actions must not be represented as working. The list is an engineering inventory, not a certification that BANK SETU already contains the features.

| Tab | Complete command families to cover | Current BANK SETU subset (not full Word) |
| --- | --- | --- |
| File (Backstage) | Info/protect, New, Open, Save, Save As, Print and preview, Share, Export PDF/other formats, Close, Account, Options, version/recovery | Local draft save, generic backup export/restore, PDF proof/calibration, PDF/DOC(X) upload. Word binary roundtrip/Backstage not complete. |
| Home | Clipboard: Cut/Copy/Paste/Format Painter; Font: family, size, emphasis, effects, superscript/subscript, case/clear format/highlight; Paragraph: lists, indent, sort, borders/shading, alignment/line spacing; Styles; Editing: Find/Replace/Select, Dictate | Object formatting, font, B/I/U, alignment, spacing, list prefix, format copy, static-label find/replace. No true mixed-run document model. |
| Insert | Pages; Tables; Pictures/Icons/Shapes/SmartArt/Charts/3D; Add-ins; Media; Hyperlinks/Bookmark/Cross-reference; Comments; Header/Footer/Page number; Text Box/Quick Parts/WordArt/Drop Cap/Date/Signature/Object; Equation/Symbol | Text, placeholders, shapes/lines, simple physical table grid, photo/logo placeholders, symbols and dynamic fields. Remaining Office document constructs not all implemented. |
| Draw | Pens, highlighters, eraser, ink to shape/math, drawing canvas where present | Lines, rectangles, ellipses, mapping boxes, existing drag/edit. No full digital ink engine. |
| Design | Themes, document sets, color/font/effect schemes, paragraph spacing; watermark, page color, borders | Object text/background/border colors and style copy. Theme and page-wide Word semantics missing. |
| Layout | Margins, orientation, paper size, columns, breaks, line numbers, hyphenation; indents/spacing; position, text wrapping, bring/send forward, selection/alignment/group/rotate | Physical page geometry, fold, printer start, margins, rotation, z layers, align/distribute, group/lock. Not full Word text reflow. |
| References | Contents, footnotes/endnotes, citation management, bibliography, captions, table of figures, index, authorities | Static notes and dynamic reference fields only. |
| Mailings | Envelopes, labels, mail-merge recipients/rules, insert fields, preview, finish & merge | Current tenant-only Bank/Customer fields and read-only preview. No bulk email merge. |
| Review | Editor/spelling/thesaurus/word count, accessibility, language/translate; comments, Track Changes, accept/reject, compare, restrict editing | Find/replace generic labels; OCR/manual correction and bank-template Master review. No native Word tracked changes. |
| View | Read/Print/Web/Outline/Draft, Navigation, ruler/grid, zoom, window arrange/split, macros, immersive reader where present | Rulers, grid, zoom, page & Quick/PR2 proof selection. |
| Help | Help/search, feedback, accessibility | Editor help/shortcuts. |
| Developer & context-sensitive tools | Forms/content controls, XML/add-ins/VBA; Table Design/Layout, Picture/Shape Format, Chart and Header/Footer contextual commands | Existing layout shapes/field controls. VBA/macro execution not safe or supported. |

**Microsoft sources**
- https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word
- https://learn.microsoft.com/en-us/office/dev/add-ins/develop/built-in-ui-ids
- https://learn.microsoft.com/en-us/office/dev/add-ins/word/word-add-ins-programming-overview
- https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/overview

## Non-negotiable UX contract

1. Open Bank → Method → Output wizard, then show the actual **editing paper immediately**. No Start & Import, Text & Customer, Graphics, or Page/Preview full-screen dashboard cards above the paper.
2. Blue title bar and navy left sidebar; tabbed ribbon immediately below title. File tab opens organized Backstage. Only one tab's command groups at a time; contextual tools appear on selection.
3. Center white measured document with top/left ruler, responsive scroll/zoom, right Bank Info / Customer Data mapping selector. Keep real customer values memory-only in tenant-private preview.
4. Large page geometry settings open in modal and return to the document; not a full-screen expander above the paper.
5. Tooltips, accessible keyboard focus, correctly disabled states for actions requiring selection. **No inert A–Z command buttons.** If a command is not supported, do not pretend it worked.
6. Additional specialist/OCR/debug actions live in a secondary disclosure or contextual review area; normal editing should not require scrolling through them.
7. Validate actual *rendered* Windows screenshots against all approved reference images at agreed desktop resolution. A green build is not visual proof.

## Acceptance gates before calling it Word parity

- Each advertised command has a named action, documented data mutation, undo/redo impact, persistence roundtrip, error handling and automated test. Count supported vs pending explicitly.
- Import/export DOCX fidelity tests for text runs, nested tables, images/anchoring, headers/footers, page breaks, sections, styles, fonts, footnotes, tracked changes; don't claim parity where there are known limitations.
- No unapproved generic design or real scanned private content is shared. No tenant leakage across bank settings, customer fields, logos, backups or cloud catalog.
- Quick Passbook remains independent from Direct PR2; only the existing PR2 bridge can print text, never graphics or source images. Union Bank values-only, approved bank geometry and physical calibration remain authoritative.
- Windows draft installer and UI screenshot; Epson PLQ manual sample checks before activation. All work stays Draft PR #100.

## First implementation pass already in this branch

- Moved the actual Word-style ribbon before the white document in the component tree.
- Shifted duplicate import/text/graphics controls into an optional collapsed disclosure below the editing viewport.
- Replaced the inline expanding Layout tab's large page setup with a separate Page Setup dialog.
- No native Microsoft Word engine, Office embedding, proprietary features, or full DOCX compatibility is claimed.
