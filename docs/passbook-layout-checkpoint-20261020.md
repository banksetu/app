# Approved passbook checkpoint — 20 October 2026

Keep this work in draft PR 55 until the owner requests the combined release.
Do not merge to production, increase the version, deploy, or publish installers.

## Assam Gramin Bank

Both Passbook Print and Quick Passbook use the approved vector label and data
renderer. Preserve all label/colon origins, per-field compression, line height,
plain zeros, and page geometry. The user's final Word master is the reference;
do not substitute earlier alignment samples or embed the Word document.

- Nominee defaults to the digit `1` when a customer is loaded, regardless of the
  stored nominee name. The existing temporary editor can override that value
  for the current preview/print; it does not change the customer record.
- Nominee glyphs use the approved 75% horizontal scale and holder-like advance.
- Opening date comes from customer data and displays as `DD-MM-YYYY`, including
  when the source date uses slashes. Issue date is the local print-day date.
- Customer address occupies three fixed rows: C/O, village/post office, then
  remaining locality/state/PIN. Keep long values at the same compression;
  report overflow rather than silently truncate or reduce the font.
- Quick Passbook keeps its hints, emblem, bank/head-office heading, photo,
  signature area, and single-line Branch Manager. Only its data/label overlay
  uses the shared approved renderer; its overlay starts at 91 mm and branch
  code at 134 mm to clear existing stationery.
- Branch details always come from the current workspace Bank Information.
  No sample branch or customer data belongs in the production source.
- Preserve Passbook Print's hover pencil and Quick Passbook's Temporary Edit,
  existing search, alignment, license checks, and accepted-print status logic.

Bank selection is based on the current workspace's selected passbook bank,
falling back to its bank name. Assam-specific defaults must not affect Union.

## Union Bank

Keep both existing Union modes unchanged. `src/UnionPassbook.tsx` retains Git
blob `0365b197ddde16a06ec10978483c063e23595c6a` from the existing branch.
Quick includes stationery and bilingual safeguards; Passbook Print is the
existing values-only overlay for preprinted stationery. Both retain the
existing customer nominee, positions, font sizing, and temporary editor.

## Verification at this checkpoint

- Production build and 16 focused passbook/desktop-print tests passed.
- Browser checks passed for Assam and Union in both modes: bank selection,
  temporary customer-field edits, Apply/Cancel, no customer-data write, and
  alignment preview. Existing test/final print status and suspended-license
  checks passed. A second workspace's Bank Information replaced the first.
- PNG previews were rendered from actual application components. Assam uses
  the owner's verified customer with Word-reference branch values; Union
  uses demonstration data. These are previews, not a physical-printer test.
