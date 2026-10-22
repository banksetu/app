# Authorized combined release — 20 October 2026

The owner authorized releasing all work in PR #55 together, including the final sidebar change. This supersedes earlier save-only instructions.

The sidebar hides vertical and horizontal scrollbar chrome while preserving wheel/touch/keyboard scrolling. Only the sidebar and its navigation are targeted. The final menu item and bottom appearance controls remain accessible in both themes at desktop and mobile widths.

Included checkpoints:
- Approved Assam Passbook Print and Quick layouts, unchanged Union layouts and temporary editing.
- Safe mobile sync recovery and dark appearance for backup, Excel export, reports and client/user settings.
- Repaired monthly/customer-entry analytics and average.
- Private support photos/audio with 24-hour server expiry/cleanup; text remains until client deletion. Tenant offboarding purges support text and media.
- npm development startup repair.

Final local verification: 41 Worker tests, 194 local tests, 37 bridge tests and 14 update tests passed; schema and production build passed. Browser checks passed for hidden-scrollbar wheel access, all four passbook modes, backup/settings/report themes and photo/audio/text support flows. The five approved passbook sources remain byte-for-byte identical to checkpoint 7a455e5b.

Release uses the existing production workflows: compatible Worker and Firestore rules first, gated single-version Windows/Android publishing and Hosting. Do not dispatch a duplicate app release. The workflow selects the next unused version. Existing independently owned Apps Script deployments require updating their existing deployment with the bundled Code.gs to receive server-side bridge changes; distributing the app does not update those deployments.
