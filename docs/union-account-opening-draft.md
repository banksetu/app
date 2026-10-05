# Union Bank AOF-5 draft — 5 October 2026

Draft only. No version bump, tag, merge, release, or deployment.

Source: the user's blank two-page `accountopeningcumoverdraftaof5ctq (2).pdf`.
Background pages are rendered at 300 DPI. Layout coordinates use a 1132 x 1600 reference.

Implemented:
- Union account opening routes to its own form, rather than the Assam form.
- Applicant, guardian and nominee names: one word -> last name; two -> first/last; three -> first/middle/last; longer -> all interior words in middle.
- Explicit per-character cells and separate photo placement. Existing data fields populate their corresponding boxes; unavailable information remains blank.
- Temporary field edits and overflow reporting before the print button is enabled.
- Generic saved print templates expose first/middle/last and two/three address lines. Explicit manual positions remain authoritative. Address splitting retains every word.
- Customer PDF extraction, tenant data access and passbook behavior are unchanged.

Remaining before release:
- Browser render and actual 100%-scale A4 print alignment need verification. The local Playwright browser was unavailable and its download failed, so build/tests do not certify physical alignment.
- The Union form has semantic House/Street/Village/Block/District/State boxes, not generic address lines. Existing structured address values are mapped, but an unstructured full address is displayed for review and must be arranged in the temporary editor. Fully automatic semantic address mapping is NOT complete.
- Nominee/permanent addresses, relationship, financial and bank-only information must come from confirmed values; they are not inferred from applicant data.
- Aadhaar remains masked, matching existing app behavior.

Validation: `node --test scripts/bank-pdf.test.mjs` (19 passed); `npm run build` passed with existing bundle-size warning. No production access or deploy command was used.
