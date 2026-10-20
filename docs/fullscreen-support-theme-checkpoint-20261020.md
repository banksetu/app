# Fullscreen, support media and complete screen appearance — save only

Base: production v1.0.103, commit `0c20a63989bb07bc7758be28a5752213b6a2b1d9`.
Owner instruction: implement and save all three workstreams together; do not release.

## Fullscreen

Removed the inherited Vite root's 1px inline border and fixed-width/margin framing. The app uses the available content viewport, including resize/maximize and mobile dynamic height, while retaining internal card spacing and OS safe areas. Android's WebView/window background and system bar appearance follow the chosen app mode; no immersive hiding of the clock, camera or gesture area.

## Support photos and audio

Sender-owned media has Reply and Delete controls. An opened photo also opens its options. Server deletion atomically removes metadata/chunks and records a deleted marker on the original message, preserving its text, timestamp and reply history. Other senders/tenants are denied. Upload retry cannot resurrect a deleted attachment. Offboarding preconditions and the existing 24-hour expiry/cleanup remain intact.

Replies use a server-validated reference to a photo/audio in the same conversation. References display deleted/expired state and retain no file copy; replying never extends the source media's lifetime. Text replies use the authenticated Worker rather than accepting forged SDK reply metadata.

A bounded, account/workspace-scoped local deletion queue preserves offline/failed requests without storing media bytes. It retries on app/support start and network reconnection, deduplicates in-flight requests and reports pending until server confirmation. Successful live message changes abort outstanding downloads and revoke open Blob URLs.

## Appearance audit and fixes

The chosen account/workspace appearance reaches the document before paint, including portals outside the main page. Added theme-aware inline UI colors with their original light-mode fallbacks. Existing bank/theme palettes and print artwork data are not rewritten.

Inspected the TSX/CSS surfaces for Dashboard/Bank Information, Customer Entry, Customer Search, All Customer Data/Customer Preview, Passbook menus, Account Opening, AFSM, Settings/Advanced Admin, Client/User Management, Sync/Backup, Excel Export, bank setup/mapping, licensing, updates, notifications, Support and camera controls.

Fixed the reported white Customer Preview Print/Close buttons, white administrator search toolbar and unreadable Delete Customer dialog. Extended dark surfaces/text/inputs/buttons/tables and selected/focus states to inline panels, portals, update UI, licensing, bank setup and mapping. App alert/confirm calls now use accessible themed dialogs with Cancel/Escape and no action on cancellation. Existing business validation and permissions remain authoritative.

The Windows app-owned print preview follows the source app appearance. Its settings/control panel is dark while the PDF payload and print settings remain unchanged. Windows native theme follows the selected mode. Browser/Android system print sheets, file pickers and platform-owned dialogs remain OS-controlled; the application cannot guarantee their colors on every vendor/OS. Actual bank paper, uploaded templates/logos, PDFs and customer photos retain their pixels. Print CSS does not inherit screen dark paints.

All five approved Assam/Union passbook implementation/artwork files are unchanged from checkpoint `7a455e5b`.

## Verification

- Real browser flows at 360/390/1280/1920px: full root width/height, no outer border, actual customer preview/deletion, bank-format panels, dark portals, confirm/cancel/alerts, light-mode fallback, white paper and actual Windows print-dialog HTML.
- Real Support React controls at 390/1280px for Master/Client Admin: photo/audio recording/send/play, reply references, delete/cancel, offline pending/reconnect and Blob URL revocation; synthetic transport only.
- Existing Sync/Excel/Reports/Settings browser scenarios and four Assam/Union passbook menu scenarios passed.
- AFSM ordered selection, 100 customers/five-page preview and explicit confirmation passed. The optional local Chromium 133 test runner uses PDF.js's official legacy build; CI uses current Chromium and the normal build.
- Worker tests cover sender/tenant checks, 24-hour expiry, physical cleanup, text retention, offboarding, deletion failures/races and reply validation/idempotency. Local queue and desktop print tests cover failure/restart/cancellation and unchanged print options.

No production merge, deployment, version bump, real customer mutation or release is authorized for this checkpoint. Live media deletion and physical Android/Windows appearance still need verification after a later authorized rollout.
