# Bank Setu Universal PR2 Printer Bridge — development acceptance

No release approval. Version remains 1.0.103; CI installer is an unsigned test artifact, not an update feed. Based on PR #56 (`8e90bbaf`), retaining its unfinished work. Production baseline is `0c20a639`, release v1.0.103.

## Implementation

The existing Direct Printer Send handler checks the preload capability (Windows, protocol 1), licenses and the loaded customer. Non-Windows uses the exact Windows-only message with OK. Trusted Electron main-frame IPC validates the signed active workspace again. A hidden sandboxed window freezes the active print document using existing print CSS. PDF.js renders that single page at 180 dpi. Every existing glyph transform, including independent 70/75/90% compression, is carried through as geometry; no text-cell substitutions or bank-specific transport data are used. The monochrome raster is converted to PR2 24-dot graphics. Source layouts/PDF generators are untouched. Finite pixel resolution and printer margins require physical verification; this is not a claim of exact output.

The bundled .NET Framework helper uses private redirected stdio, never HTTP, never port 12030 and never the bank's service. USB discovery uses the Windows USBPRINT device interface and IEEE1284 identification, COM uses SerialPort, LPT uses the Windows parallel device. Device handles are opened exclusively; unsupported bidirectional drivers fail explicitly. This is not WritePrinter RAW spooler printing. No drivers are installed/replaced. No resets, emulation switching or force-clamp commands are sent.

Identity + status + paper responses are validated. Unknown responses fail closed. Paper waits have a 60-second bound and cancellation; overall job has a 180-second bound plus the current bounded native operation. A partial/uncertain job fences that device until physical inspection and explicit acknowledgement. Durable metadata contains opaque request IDs, device IDs and hashed scope, never customer print data. One job per device; no automatic retries. Confirmation requires device processing and paper release replies, not merely a successful write. Neither electrical acknowledgement nor mocks prove physical ink placement.

Native helper is built by electron-builder's Windows beforePack hook and included at `resources/pr2` with a protocol/checksum manifest. Existing NSIS install/update/repair replaces these files automatically. No service, scheduled task, TCP port or machine-wide configuration is added. Existing updater is unchanged. Helper lives only during requests and is killed on timeout/cancel/quit; app startup never probes printers. Uninstall removes installed resources while retaining existing app data/preferences.

## Command evidence / limitations

Epson PLQ-20/PLQ-20M Programming Guide, NPD0841-00 Rev A (June 2004), Epson-authored PDF mirrored at https://www.installing.ru/files/plq20pg_e.pdf. Relevant command sheets: 43, 51, 54, 58–66, 73, 76–79, 83. Identity ESC Z, control procedure ESC n, status ESC j, paper ESC SP B, normal feed ESC L, coordinates ESC / and ESC |, graphics ESC ! G / ESC 1 C, escaped image data (top LSB), ESC CR/LF, ESC 2 and FF are implemented separately. The captured mixed 42-byte prefix is not used.

Epson PLQ-20 emulation specification: https://support2.epson.net/manuals/english/sidm/plq_20/guide/html/apspe_2.htm
Microsoft USBPRINT interface: https://learn.microsoft.com/en-us/windows-hardware/drivers/print/programming-considerations-for-usbprint

Only PLQ-20/20M has an enabled documented graphics profile; it is NOT hardware-certified. PLQ-35 PR2 emulation is advertised by Epson, but its matching command/graphics/status profile still needs verification. PLQ-32 and other models are not enabled by guessing. Profiles can be added without bank-template or transport changes. USB name matching identifies candidates only; the operator must confirm the physical model and configured emulation, then run the bidirectional probe. Multiple candidates always require selection. COM/LPT require manual identification/settings. A spooler-conflicted/read-unsupported USB handle is a blocker, not silent fallback to unconfirmed spooler completion.

Printer vertical default resolution (216/240 units/inch) must match its configuration sheet. Horizontal reference is relative to the printer's printable left margin. Printer-side ±10 mm calibration does not change source artwork. Print a synthetic 100 × 40 mm calibration rectangle before a real customer job. Graphics are monochrome at 180 dpi; unsupported page count/size is rejected without resizing. Future versioned templates are consumed through their active DOM print layout, independent of this bridge.

## Acceptance still requiring real equipment

PLQ-20 USB/PR2 bidirectional access with installed Windows driver; inserted before/after Print; no paper timeout/cancel; power/disconnect/jam; multiple printers; normal feed/release; repeated jobs without duplicates; compare every compressed text field and coordinates against approved passbook, with printer-side calibration only. PLQ-32/35 need separate documentation and hardware acceptance before enabling. Signing and ordinary end-user UAC/updater interaction need release-stage acceptance; CI silent installation is not that test. Never publish a release or change live update manifests before user approval.
