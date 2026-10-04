# Bank Setu — Client Admin Google connection

यह guide नए Option B implementation के लिए है। अभी इसे live app पर deployment और वास्तविक client-account test के बाद इस्तेमाल करें। पुराना working connection अपने आप migrate नहीं होता।

## App में दो steps

पहले अपनी Bank Information save करें। Google Sheet और Drive folder आपके verified Bank Setu login email वाले Google account में होने चाहिए। Client Users connection नहीं बदल सकते; वे Client Admin का connection इस्तेमाल करेंगे।

1. **Share करें।** अपनी Bank Setu Sheet को अपने चुने हुए Drive folder में रखें। Sheet और folder दोनों की Share screen में यह email डालकर Editor चुनें:

   `bank-setu-drive-sync@banksetu-69e2f.iam.gserviceaccount.com`

2. **Test & Connect करें।** Client Workspace Settings में Google Sheet link, Drive folder link और पहले से तैयार client-owned upload bridge का `/exec` URL डालें। Test & Connect दबाएँ। Success के बाद workspace खोलने के लिए app reload करें।

Connection test resource owner, Sheet location, Editor access, original 24 headers, bridge tenant binding और दूसरे tenant के resource reservation की जाँच करता है। गलत columns पर existing customer data overwrite नहीं होता।

## पहली बार की जरूरी तैयारी — यह दो app steps से अलग है

सामान्य Gmail में service account अकेले नए PDFs/photos का owner नहीं बन सकता। इसलिए client के Google account में एक बार Apps Script bridge authorize और deploy करना जरूरी है। यह तैयारी अभी अपने आप नहीं होती; इसे पूरी पहली setup का “केवल दो steps” न समझें। Bank Setu के OAuth client पर connection निर्भर नहीं है, लेकिन Google में script को अनुमति देना जरूरी है।

Administrator client को इसी repository का `apps-script/Code.gs` देता है। Client अपनी Sheet → Extensions → Apps Script में इसे डालता है। Project Settings → Script properties में ये values लगती हैं:

| Property | Value |
| --- | --- |
| `BANKSETU_FIREBASE_API_KEY` | Bank Setu Firebase web API key; deployment account private key नहीं |
| `BANKSETU_CLIENT_TENANT_ID` | App में दिखा अपना tenant ID |
| `BANKSETU_CLIENT_SPREADSHEET_ID` | Sheet link में `/d/` के बाद वाला ID |
| `BANKSETU_CLIENT_FOLDER_ID` | Drive link में `/folders/` के बाद वाला ID |

Client `initializeClientWorkspace` function एक बार अपने Google account से Run और authorize करे। इससे Sheet1 और headers तैयार होंगे; existing अलग headers या Y:AA में अपने columns होने पर migration रुकेगी।

Deploy → New deployment → Web app → Execute as **Me** चुनें। API calls के लिए **Anyone** access वाला deployment चाहिए; request में Firebase token अनिवार्य है और script केवल अपने configured tenant/Sheet/folder का इस्तेमाल करती है। `/exec` URL app में रखें। Script को बाद में बदलने पर उसी deployment को नया version दें।

Google organization policy अगर Anyone deployment रोकती है तो इस bridge का deployment नहीं चलेगा; उस client के लिए अलग approved access design जरूरी होगा।

## Offline काम

पहले internet से login और verified Option B connection तैयार करें। इस signed-in session में customer save/search स्थानीय database से चलेगा। Offline access आठ घंटे बाद permissions दोबारा जाँचने के लिए internet माँगेगा। नए device पर पूरा cache बनने तक सभी पुराने customers offline नहीं मिलेंगे। Internet पर Sync Now या background sync queue भेजेगा। Logout पर अधिकतम तीन सेकंड का अंतिम sync प्रयास होता है; बाकी queue मिटती नहीं।

Web में browser/site data हटाने से local records मिट सकते हैं। Pending records होने पर **Export backup** रखें। Windows database per-user app-data में encrypted SQLite है। Backup export JSON में customer information होती है; इसे निजी रखें। Export का automatic restore/import अभी उपलब्ध नहीं है।

Pending count शून्य होने तक cloud sync पूरा न मानें। Review count बढ़े तो Client Admin local और Google versions देखे: Keep local/retry या Use Google version चुने। Cloud version चुनना उस record के सभी pending edits हटाता है; पहले export करें। दूसरे user या नई Sheet/connection में पुराने pending records अपने आप नहीं भेजे जाते।

## वास्तविक acceptance test

Administrator पहले एक test client में connection, customer + photo/PDF upload, local search, offline save, internet लौटने पर sync, retry बिना duplicate, दो clients का data separation और reconnect test करे। Signed Windows update को वास्तविक Windows machine पर installer, backup और restart सहित test करने के बाद ही production-ready मानें।
