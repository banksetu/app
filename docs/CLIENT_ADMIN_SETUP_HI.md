# Bank Setu 1.0.5 — Client Admin connection और testing

## पहले Master की एक बार की तैयारी

Cloudflare Worker में `GOOGLE_DRIVE_SERVICE_ACCOUNT` secret dedicated sync account के JSON से configure होना चाहिए। Account: `bank-setu-drive-sync@banksetu-69e2f.iam.gserviceaccount.com`। Google project में Drive और Sheets APIs enabled हों। Firebase administration credential अलग रहता है। JSON को chat, code या client को न दें। GitHub Actions secret `BANKSETU_GOOGLE_DRIVE_SERVICE_ACCOUNT` configure करने पर testing deployment इसे Worker में रखता है; पहले से configured Worker secret भी चलेगा।

Testing web link GitHub Actions के **Deploy local-first testing frontend and compatible backend** run में मिलता है। Windows EXE **Local-first validation and Windows test build** run → Artifacts → `BankSetu-Windows-UNSIGNED-TEST` ZIP में है। ZIP extract करके `.exe` installer खोलें; `.blockmap` installer नहीं है। सफल branch build के बाद GitHub Releases में direct EXE download भी प्रकाशित होता है।

## Client Admin के लिए app में दो steps

अपनी Bank Information पहले save करें। Sheet और folder का owner वही Google email हो जो verified Bank Setu Client Admin login email है। Sheet को उसी Drive folder में रखें। Client User connection बदल नहीं सकता।

1. **Share:** Sheet और folder दोनों की Share screen में `bank-setu-drive-sync@banksetu-69e2f.iam.gserviceaccount.com` को Editor दें।
2. **Connect:** Client Workspace Settings में Sheet link, Folder link और तैयार bridge का `/exec` URL डालकर **Test & Connect** दबाएँ। Success के बाद app reload करें।

Ownership, Editor access, Sheet का folder, original 24 headers और दूसरे client के resource binding की जाँच होती है। Existing गलत headers पर data overwrite नहीं होता। नई connection में पुराने pending records अपने आप नहीं भेजे जाते।

## पहली बार bridge तैयार करना

यह Google की जरूरी initial authorization है; पूरी पहली setup केवल दो clicks में नहीं होती। App में ऊपर के दो connection steps हैं। Client का अपना authorized Apps Script Gmail Drive में PDFs/photos upload करता है।

- Settings में Sheet और Folder link भरें और **Download ready client setup** दबाएँ। `BankSetuClientSetup.gs` में अपने tenant/resource IDs और public Firebase web key पहले से भरे मिलेंगे; Script properties हाथ से भरने की जरूरत नहीं है।
- अपनी Sheet → **Extensions → Apps Script** खोलें। Downloaded file का पूरा text editor में लगाकर Save करें।
- Function list से **setupBankSetuClient** चुनें, Run करें और अपने Google account में permissions authorize करें। यह Sheet1 और headers तैयार करता है। Y:AA में existing दूसरे columns हों तो setup सुरक्षित रूप से रुकता है।
- **Deploy → New deployment → Web app**, Execute as **Me**, access **Anyone** चुनें। Deployment के `/exec` URL को app में डालकर Test & Connect करें।

Anyone deployment में भी API requests के लिए approved Firebase user/tenant authorization अनिवार्य है। Script update के बाद उसी deployment में नया version select करें। Google organization अगर Anyone deployment रोकती है, तो यह setup उस account में उपलब्ध नहीं होगा। दूसरे owner email या Shared Drive का ownership flow इस version में समर्थित नहीं है।

## Offline, backup और update

पहली login/connection internet पर करें। उसके बाद persisted Firebase session के साथ आठ घंटे की server-signed offline permission में app बंद करके offline दोबारा खोल सकते हैं। Offline नई password login नहीं होती। Online रहते permission हर 30 मिनट renew करने का प्रयास होता है। Instant blocking की खबर offline device को नहीं मिल सकती; expired permission पर internet चाहिए, records retained रहते हैं।

Data pages में cache होता है; startup पर सारी बड़ी Sheet एक साथ download नहीं होती। **Sync Now** दोहराएँ या background sync को चलने दें। Cache अधिकतम 10,000 records/लगभग 80 MB; pending records सुरक्षित रखे जाते हैं। सभी बड़े-workspace customers offline उपलब्ध होने का दावा नहीं है। Pending zero और downloading समाप्त होने पर उस traversal की sync पूरी है।

**Export backup** JSON निकालता है; **Restore backup** इसी user/tenant/connection की file को merge करता है। Duplicate operations फिर append नहीं होते; अलग versions review में जाते हैं। Backup में customer information है, इसे निजी रखें। Browser site data हटाने से local data खो सकता है; Windows में encrypted SQLite per-user app-data में रहता है। Logout pending queue नहीं मिटाता।

Conflict पर Client Admin versions देखकर **Keep local/retry** या **Use Google version** चुनता है। Google version चुनने से उस record के pending edits हटते हैं, पहले export करें।

Windows test installer बिना signing certificate का है। Software Update screen fixed `banksetu/app` GitHub release से नई version जाँचती है, SHA-256 checksum मिलाती है और install से पहले database backup बनाती है। नया installer release में publish होने तक “no newer version” सही है। Signed build का Authenticode updater अलग सुरक्षित path पर रहता है। Web update waiting offline shell को activate करता है।

## आप जो पूरा test करेंगे

1. Test Client Admin से connection बनाएँ। एक customer, photo और PDF upload करें; उसी Sheet/Folder में देखें।
2. Account number/name से search; passbook, account-opening और custom bank PDF preview/print देखें। Assam और existing Master connection भी जाँचें।
3. Internet बंद कर entry/save/search करें, app बंद करके खोलें, pending data देखें। Internet लौटाकर Sync Now करें; retry पर duplicate न बने।
4. दो devices से same customer edit करें; conflict review आए। दूसरे client का data न दिखे।
5. Export, नया local test profile या सुरक्षित test reset और same user/connection में Restore करें। Queue/records देखें।
6. Windows ZIP extract करके EXE install करें। Login, save, restart, print, offline और backup restore दोहराएँ। अगली higher version release पर Software Update और database retention जाँचें।

Testing केवल अलग client/test records पर करें। Automated checks असली Google permissions, upload quotas और आपके printer/device परीक्षण की जगह नहीं लेते।
