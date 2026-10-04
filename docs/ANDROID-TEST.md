# Android development baseline

Base: live commit ed809a2fedad2b174e6d3179c08c8f9d7dbbb5c1.
Search and Union passbook changes are included following release authorization.

This branch builds a test APK; it does not deploy Firebase Hosting or publish a store release.
Run `npm ci`, then `npm run android:sync`. Build with Java 21 and Android SDK 36 using `npm run android:debug`.
GitHub Actions builds and retains the APK as BankSetu-Android-TEST-APK for 14 days.

The app bundles its frontend. Capacitor serves local assets at the existing app HTTPS origin; no remote server URL and no CORS permissions are widened.
Local customer storage currently uses app WebView IndexedDB, scoped by existing user/workspace IDs. This is not native SQLite. Clearing app data or uninstalling removes it.
Android backup export uses the native share/save sheet. Restore uses the existing file input and validated workspace backup merge.
Printing invokes the Android print service (including Save as PDF where available).

Before distribution, verify on an Android device:
- email/password login and correct master/client role;
- offline save, restart and pending queue recovery;
- online sync, cloud fallback search and tenant isolation;
- PDF/photo file selection and parsing;
- export backup and restore the exported file;
- print preview alignment and PDF output;
- keyboard, rotation, Android Back, external links and app resume.

Known remaining release work: stable release signing key, native OAuth flow for legacy Google sign-in, physical-device testing and app icon polish. Debug keys can differ across CI runs, so these APKs are not the final update channel. Do not uninstall an existing test install with unsynced data merely to install a differently signed APK.
Updates will be built from explicitly accepted commits using the same app ID and release signing key. No draft is fetched into the app automatically.

## Signed Android releases and updates
The Android release workflow requires ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD in repository Actions secrets. Retain the same keystore securely for all future releases. Never put keys or passwords in source control.
Run the signed workflow with an increasing version code and version name. It builds, verifies, and uploads a signed APK artifact. After device acceptance, publish it as `BankSetu-Android-<versionCode>.apk` in a non-draft, non-prerelease GitHub release. Settings > Check for Update discovers that asset and opens its download. Android installation requires user confirmation; the system verifies the installed app signature. A repository push alone does not update installed apps.
Windows release is currently blocked by missing/incomplete WINDOWS_CSC_LINK, WINDOWS_CSC_KEY_PASSWORD and WINDOWS_PUBLISHER_NAME repository secrets. Its existing signed updater uses GitHub releases and retains the local database.
