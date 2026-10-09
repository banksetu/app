# Bank Setu public portfolio

यह केवल public website है। Login तथा ग्राहक data Windows/Android app में ही हैं।

## Content बदलने के छोटे कदम

1. GitHub में `portfolio/content/site.json` खोलें और pencil/Edit दबाएँ।
2. Heading, description, feature text या `theme` colors बदलें। Screenshot जोड़ना हो तो केवल anonymized image `portfolio/public/screenshots/` में रखें और JSON में `/screenshots/name.png` तथा alt text जोड़ें। वास्तविक ग्राहक जानकारी न रखें।
3. Commit करें। **Actions → Bank Setu — Portfolio Deploy → Run workflow** दबाएँ। यह EXE/APK release नहीं करेगा।
4. Workflow का live verification देखें और `https://banksetu-app.web.app` खोलें। Layout बदलने के लिए `portfolio/src/` में सामान्य code edit करें।

`npm run build:portfolio` अलग `portfolio-dist/` बनाता है। `npm run build` मूल authenticated app को `dist/` में बनाता है। Firebase Hosting का public directory portfolio deploy में `portfolio-dist` है; app installers `dist` से बनते हैं। Download links `public/version.json` से लिए जाते हैं; release workflow केवल verified assets प्रकाशित करने के बाद इसे अपडेट करता है।

Release fail होने पर पिछले प्रकाशित release/manifest को सक्रिय रखें। Website rollback के लिए Firebase Hosting console में पिछली verified release को clone/restore करें; इसके लिए कोई local customer database reset न करें।
