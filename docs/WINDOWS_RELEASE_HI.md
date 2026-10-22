# Bank Setu Windows EXE और future updates

Bank Setu का Windows desktop build Electron + encrypted per-user SQLite storage पर चलता है। `npm run desktop:pack:unsigned` local/client testing के लिए unsigned NSIS installer बनाता है। Production release के लिए GitHub Actions का **Publish signed Android and Windows release** workflow इस्तेमाल करें।

## Production signing

Windows production installer को भरोसेमंद और automatic-update योग्य बनाने के लिए repository Actions secrets में ये तीन values रखनी होती हैं:

- `WINDOWS_CSC_LINK` — सुरक्षित base64 `.pfx`/code-signing certificate
- `WINDOWS_CSC_KEY_PASSWORD` — certificate password
- `WINDOWS_PUBLISHER_NAME` — certificate का exact publisher name

Certificate/password को source code, Firebase Hosting, APK या chat में न रखें। Certificate न होने पर workflow जानबूझकर production release रोकता है; unsigned installer को final production नहीं माना जाता।

## एक release से तीनों delivery channels

1. `package.json` का version बढ़ाएँ और `public/version.json` को उसी release के साथ commit करें। `npm run release` version, lockfile और update manifest को साथ बदलता है।
2. उसी commit का tag push करें, जैसे `v1.0.7`।
3. `Publish signed Android and Windows release` workflow उसी tag/source से signed APK और signed Windows installer बनाएगा, फिर GitHub Release में दोनों assets और Windows `latest.yml` प्रकाशित करेगा।
4. `Deploy Bank Setu Firebase Hosting` workflow `v*` tag पर उसी source को Firebase Hosting के live channel में deploy करेगा।

इससे repository का version, Firebase web app और GitHub native release एक ही version पर रहते हैं। Installed Windows app signed GitHub update feed जाँचती है; Android app stable APK asset जाँचती है; web app `/version.json` जाँचती है।

## App में update notification

Logged-in app session में Bank Setu background में एक बार update check करती है। नया version मिलने पर notification card में **Download / Install update** दिखता है।

- Windows में database update से पहले backup बनाकर signed installer download/install होता है।
- Android में signed APK का GitHub download खुलता है; Android की सामान्य install confirmation पूरी करनी होती है।
- Web में नया Firebase build मिलने पर page/service-worker update activate होता है।

Update के दौरान customer data `userData`/local storage से नहीं मिटता। Windows updater पहले encrypted SQLite backup बनाता है। भविष्य की release में version हमेशा बढ़ाएँ; पुराने GitHub release assets replace न करें।

