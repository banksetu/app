# Mobile sync and appearance checkpoint — 20 October 2026

Keep this work in draft PR 55 for the owner's combined release. No production
merge, version bump, deployment, bridge deployment, APK or EXE publication.

## Mobile sync recovery

The reported screenshots show `Customer change batch was incomplete; device
checkpoint retained` and repeated `System Health: Recovering` despite locally
available records/photos. The previous incremental path treated incomplete
responses and `REBASE_REQUIRED` identically and retried the same checkpoint.
The exact response from the installed phone was not available for inspection.

- A compacted/expired journal, incomplete or duplicate returned batch, or legacy
  non-UUID ID now switches once to the existing authenticated full inventory
  and paged customer download for the currently bound workspace.
- Every inventory retains the existing connection validation. Failed or
  differently scoped inventory verification leaves the prior checkpoint,
  customer/photo cache and queued operations intact.
- A delta cursor advances only after the complete requested batch is verified;
  recovery pages commit with their cursor and resume after interruption.
- Cached photo previews and pending edits use the existing merge protections.
  No local database reset, queue deletion, cloud data change, or sync-engine
  replacement is involved.
- Successful manual sync clears the stale background Recovering status.
  Genuine sync/photo errors remain visible. The summary now says `Sync needs
  attention` while an error is present instead of also claiming completion.

## Dark mode

Screen-only, selected-appearance rules now cover:

- Sync & Backup header, cards, storage details, health/error panels, actions,
  restore controls, footer and data-viewer dialog.
- Excel export panel, mode choices, selected state, search results, options,
  estimates, inputs and footer, including outside-shell dialogs.
- Reports panel, desktop table and mobile activity cards. Its root now has
  the intended `reports-page` class.
- Settings Client/User Management summary, workspace/child cards, counts,
  status metadata and management actions; the create-client surface.

Light appearance and printable passbook artwork are outside these overrides.

## Verification

- 99 targeted sync, IndexedDB, photo, backup, recovery and passbook tests passed.
- Seven new recovery checks cover expired/incomplete/duplicate batches, legacy
  IDs, manual recovery status, wrong-connection rejection with pending data,
  and interrupted full-download resume.
- Real React components passed browser checks at 390 px (Android-style mobile
  context) and 1280 px for Master Owner and Client Admin, including appearance
  toggling, Excel's four modes, portal colors, error contrast, overflow and
  screen/print scoping. These are browser checks, not a physical-phone test.
- Existing Assam and Union Passbook Print/Quick browser checks passed again.
- All five passbook implementation/artwork files are byte-for-byte identical
  to approved commit `7a455e5b020a03ac42bc3a9b5fc6bd3cd582befa`.
- Production build passed. Existing chunk-size warning remains informational.
