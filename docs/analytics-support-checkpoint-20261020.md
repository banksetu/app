# Analytics and support checkpoint — 20 October 2026

Save in draft PR 55 with the approved passbooks and mobile/theme fixes. The
owner explicitly requested no release or deployment yet.

## Dashboard analytics

- Local customer creation now stores its creation timestamp before queueing.
  Edits preserve that timestamp. The queued creation time is retained by the
  Apps Script writer even when an offline entry uploads on a later day.
- Analytics accepts ISO timestamps and real Sheet creation-date display values,
  including Indian day/month dates and unambiguous month/day dates. India
  calendar months are consistent across device timezones.
- Monthly entries and the explicit trailing-12-month average update through
  the existing tenant-scoped local-data event path. Opening dates/cache times
  are never substituted for missing entry history; undated rows stay excluded.

## Private support media

- Master support, Client Admin and Client User can send photos and audio in
  private conversations. The composer supports file selection and voice
  recording; Android declares the microphone permissions required by the
  existing Capacitor permission handler. Windows' existing trusted-origin
  media permission handling is reused.
- Photos resize to JPEG, at most 1 MB after processing. Audio is capped at
  2 MB; voice recording stops after two minutes. Video/SVG upload types are
  rejected. Server MIME signatures, body limits, IDs and ownership are checked.
- Reuse existing Firestore with small private chunks and the existing Worker
  cron. No Firebase Storage, Blaze, paid Functions, billed TTL or new storage
  provider is required. Temporary media is bounded to 20 active files per
  tenant and 200 globally. The Worker service account alone accesses chunks.
- Server-assigned expiry is exactly upload time plus 24 hours. Authenticated
  reads reject at that boundary even before cleanup. Every-minute scheduled
  cleanup physically deletes metadata and all chunks (up to 20 files per run;
  backlog/transient failures retry on subsequent runs). Expired blobs are
  revoked in the open UI as well. No public URL or persistent client media
  cache is created.
- Text/captions remain in message history until Client Admin offboarding.
  Expired files show an expired placeholder; text is not aged out.
- Offboarding removes all tenant media and conversation children before parent
  documents/profiles, including orphan threads. Cleanup is tenant scoped,
  batched and retryable. Incomplete cleanup never reports successful deletion.
  Sender/tenant version checks make uploads atomic against offboarding; rules
  also reject concurrent direct text writes to a closing workspace.
- Existing license checks still apply to the new Worker routes. Existing
  announcements and unrelated tenants are preserved.

## Verification and rollout

- Worker route integration checks cover both upload directions, private reads,
  idempotency, exact 24-hour cutoff, scheduled byte deletion with text retention,
  complete Client Admin offboarding, interrupted deletion/retry, cross-tenant
  denial, race rollback, invalid/video/oversize input and 2 MB audio chunking.
- Firestore emulator checks cover support roles/tenant isolation, denied direct
  chunk access/forged attachments, offboarding writes and existing license rules.
- Real React browser checks at 390 and 1280 px for Master Owner/Client Admin
  exercised the floating button, photo preparation/send/view, actual voice
  recording/send/play and subsequent text send. Existing dark-mode/passbook
  checks were rerun. Core sync/bridge/analytics/Worker regressions and build pass.
- These are local server-handler/emulator/browser tests using synthetic data,
  not tests of the new code on live deployed infrastructure or physical apps.
  No real client, chat, attachment or customer data was changed for testing.
- Joint rollout must include Worker, Firestore rules, client Code.gs, web/native
  app builds and on-device microphone validation. The CI rules gate now includes
  support rules. Do not publish any of these until the owner requests release.
- All five approved passbook implementation/artwork files remain unchanged.
